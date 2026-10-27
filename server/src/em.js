// 数据源层：东财(主) + 新浪/腾讯(备) 三源容灾，带熔断与自动恢复
// 东财 push2 被风控临时封禁时自动切换备源，每 10 分钟探测一次恢复情况
const HEADERS_EM = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Referer: 'https://quote.eastmoney.com/',
};
const HEADERS_SINA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Referer: 'https://finance.sina.com.cn/',
};

async function fetchText(url, headers, timeoutMs = 8000) {
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 400));
    }
  }
  throw lastErr;
}

const fetchJSON = async (url, headers, t = 8000) => JSON.parse(await fetchText(url, headers, t));
export const fetchGBK = async (url, headers, t = 8000) => new TextDecoder('gbk').decode(await (await fetch(url, { headers, signal: AbortSignal.timeout(t) })).arrayBuffer());

// ---------- 源健康：东财失败 2 次即熔断 10 分钟 ----------
const health = { emDownUntil: 0, emFails: 0, emLastError: null, lastEmOkAt: null };
export function sourceStatus() {
  return {
    emBlocked: Date.now() < health.emDownUntil,
    emLastError: health.emLastError,
    lastEmOkAt: health.lastEmOkAt,
  };
}
function markEmOk() {
  health.emFails = 0;
  health.lastEmOkAt = Date.now();
}
function markEmDown(e) {
  health.emFails++;
  health.emLastError = e.cause?.code || e.message;
  if (health.emFails >= 2) {
    health.emDownUntil = Date.now() + 10 * 60_000;
    health.emFails = 0;
    console.warn('[source] 东财 push2 熔断 10 分钟 →', health.emLastError);
  }
}

async function withEm(tag, primary, fallback) {
  if (Date.now() >= health.emDownUntil) {
    try {
      const r = await primary();
      markEmOk();
      return { data: r, degraded: false };
    } catch (e) {
      markEmDown(e);
    }
  }
  const fb = await fallback();
  return { data: fb, degraded: true };
}

// ---------- 沪深主板+创业板+科创板（东财 fs 语法） ----------
export const A_SHARES_FS = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23';

// ================= 指数 =================
async function emIndices() {
  const url =
    'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006,1.000688' +
    '&fields=f2,f3,f4,f6,f12,f14,f104,f105,f106';
  const d = await fetchJSON(url, HEADERS_EM);
  const diff = d?.data?.diff || [];
  if (!diff.length) throw new Error('东财指数空响应（软封禁）');
  return diff.map((x) => ({
    code: x.f12, name: x.f14, price: x.f2, pct: x.f3, change: x.f4,
    amount: x.f6, advancers: x.f104, decliners: x.f105, flat: x.f106,
  }));
}

// 新浪指数（无涨跌家数，用 null 占位，由全市场扫描补齐）
const SINA_INDEX_LIST = 's_sh000001,s_sz399001,s_sz399006,s_sh000688';
async function sinaIndices() {
  const txt = await fetchGBK(`https://hq.sinajs.cn/list=${SINA_INDEX_LIST}`, HEADERS_SINA);
  const out = [];
  for (const m of txt.matchAll(/hq_str_(s_\w+)="([^"]*)"/g)) {
    const f = m[2].split(',');
    if (f.length < 6) continue;
    const code = m[1].replace(/^s_/, '').slice(2);
    out.push({
      code,
      name: f[0],
      price: parseFloat(f[1]),
      change: parseFloat(f[2]),
      pct: parseFloat(f[3]),
      volume: parseFloat(f[4]),
      amount: parseFloat(f[5]) * 1e4,
      advancers: null, decliners: null, flat: null,
    });
  }
  return out;
}

export async function getIndices() {
  return withEm('indices', emIndices, sinaIndices);
}

// ================= 排行榜 =================
async function emRank(fid, pz = 50) {
  const url =
    `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${pz}&po=1&np=1&fltt=2&invt=2&fid=${fid}` +
    `&fs=${A_SHARES_FS}&fields=f2,f3,f5,f6,f8,f10,f12,f14,f15,f16,f18,f21,f100`;
  const d = await fetchJSON(url, HEADERS_EM);
  const diff = d?.data?.diff || [];
  if (!diff.length) throw new Error('东财榜单空响应（软封禁）');
  return diff.map((x) => ({
    code: x.f12, name: x.f14, price: x.f2, pct: x.f3, volume: x.f5, amount: x.f6,
    turnover: x.f8, volRatio: x.f10, high: x.f15, low: x.f16, prevClose: x.f18,
    floatCap: x.f21, industry: x.f100,
  }));
}

// 新浪备源：按 changepercent / amount 排序（无量比字段，量比榜降级为换手榜）
const SINA_SORT = { f3: { sort: 'changepercent', key: 'pct' }, f10: { sort: 'turnoverratio', key: 'turnover' }, f6: { sort: 'amount', key: 'amount' } };
const isBJ = (code) => /^(8|4|92)/.test(String(code));

async function sinaRank(fid, pz = 50) {
  const cfg = SINA_SORT[fid];
  const txt = await fetchText(
    `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData` +
      `?page=1&num=80&sort=${cfg.sort}&asc=0&node=hs_a&symbol=&_s_r_a=page`,
    HEADERS_SINA
  );
  let rows;
  try {
    rows = JSON.parse(txt) || [];
  } catch {
    rows = [];
  }
  if (!rows.length) {
    console.warn(`[sinaRank:${fid}] 空响应 len=${txt.length} head=`, txt.slice(0, 100));
    return [];
  }
  return rows
    .filter((x) => !isBJ(x.code))
    .map((x) => ({
      code: x.code, name: x.name, price: parseFloat(x.trade), pct: parseFloat(x.changepercent),
      volume: parseFloat(x.volume), amount: parseFloat(x.amount),
      turnover: parseFloat(x.turnoverratio), volRatio: null,
      high: parseFloat(x.high), low: parseFloat(x.low), prevClose: parseFloat(x.settlement),
      floatCap: parseFloat(x.nmc) * 1e4, industry: null,
      isST: /ST/i.test(x.name || ''),
    }))
    .sort((a, b) => (b[cfg.key] || -1e9) - (a[cfg.key] || -1e9))
    .slice(0, pz);
}

// fid='f10' 在备源下降级为换手榜
export async function getRank(fid, pz = 50) {
  const r = await withEm('rank:' + fid, () => emRank(fid, pz), () => sinaRank(fid, pz));
  return { data: r.data, degraded: r.degraded && fid === 'f10' };
}

// ================= 自选股快照 =================
export function codeToSecid(code) {
  const c = String(code).trim();
  return /^(6|9)/.test(c) ? `1.${c}` : `0.${c}`;
}

async function emQuotes(codes) {
  const url =
    `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=${codes.map(codeToSecid).join(',')}` +
    '&fields=f2,f3,f4,f5,f6,f8,f10,f12,f14,f15,f16,f18,f21,f100';
  const d = await fetchJSON(url, HEADERS_EM);
  const diff = d?.data?.diff || [];
  if (!diff.length) throw new Error('东财快照空响应（软封禁）');
  return diff.map((x) => ({
    code: x.f12, name: x.f14, price: x.f2, pct: x.f3, change: x.f4, volume: x.f5, amount: x.f6,
    turnover: x.f8, volRatio: x.f10, high: x.f15, low: x.f16, prevClose: x.f18,
    floatCap: x.f21, industry: x.f100,
  }));
}

// 腾讯备源（含量比[49]，无行业字段）
async function tencentQuotes(codes) {
  const q = codes
    .map((c) => String(c).trim())
    .filter((c) => /^(0|3|6|9)/.test(c))
    .map((c) => (/^(6|9)/.test(c) ? 'sh' : 'sz') + c)
    .join(',');
  if (!q) return codes.map((c) => ({ code: c, name: c, price: null }));
  const txt = await fetchGBK(`https://qt.gtimg.cn/q=${q}`);
  const byCode = new Map();
  for (const m of txt.matchAll(/v_(?:s_)?(sh|sz|bj)?(\d{6})="([^"]*)"/g)) {
    const f = m[3].split('~');
    if (f.length < 50) continue;
    byCode.set(m[2], {
      code: m[2], name: f[1], price: parseFloat(f[3]), change: parseFloat(f[31]),
      pct: parseFloat(f[32]), volume: parseFloat(f[36]) * 100, amount: parseFloat(f[37]) * 1e4,
      turnover: parseFloat(f[38]), volRatio: parseFloat(f[49]),
      high: parseFloat(f[33]), low: parseFloat(f[34]), prevClose: parseFloat(f[4]),
      floatCap: parseFloat(f[44]) * 1e8, industry: null,
    });
  }
  return codes.map((c) => byCode.get(String(c).trim()) || { code: String(c), name: String(c), price: null });
}

export async function getQuotes(codes) {
  if (!codes.length) return [];
  const r = await withEm('quotes', () => emQuotes(codes), () => tencentQuotes(codes));
  return r.data;
}

// ================= 全市场扫描（新浪分页，约 70 页；供涨跌家数与后续形态扫描用） =================
export async function sinaFullSweep(onProgress) {
  const countTxt = await fetchText(
    'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a',
    HEADERS_SINA
  );
  const total = parseInt(String(countTxt).replace(/[^0-9]/g, ''), 10) || 5300;
  const pages = Math.ceil(total / 80);
  const rows = [];
  for (let p = 1; p <= pages; p++) {
    const txt = await fetchText(
      `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData` +
        `?page=${p}&num=80&sort=changepercent&asc=0&node=hs_a&symbol=&_s_r_a=page`,
      HEADERS_SINA
    );
    let batch;
    try {
      batch = JSON.parse(txt) || [];
    } catch {
      break;
    }
    if (!batch.length) break;
    for (const x of batch) {
      if (isBJ(x.code)) continue;
      rows.push({
        code: x.code, name: x.name, price: parseFloat(x.trade), pct: parseFloat(x.changepercent),
        open: parseFloat(x.open), high: parseFloat(x.high), low: parseFloat(x.low),
        prevClose: parseFloat(x.settlement), volume: parseFloat(x.volume), amount: parseFloat(x.amount),
        turnover: parseFloat(x.turnoverratio), floatCap: parseFloat(x.nmc) * 1e4, isST: /ST/i.test(x.name || ''),
      });
    }
    onProgress?.(p, pages);
    await new Promise((res) => setTimeout(res, 120));
  }
  let advancers = 0, decliners = 0, flat = 0, amount = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.pct) || r.price === 0) continue; // 停牌
    if (r.pct > 0) advancers++;
    else if (r.pct < 0) decliners++;
    else flat++;
    if (Number.isFinite(r.amount)) amount += r.amount;
  }
  return { rows, total: rows.length, advancers, decliners, flat, amount, updatedAt: Date.now() };
}

// ================= 涨停/炸板/跌停池（push2ex，独立主机，当前不受 push2 封禁影响） =================
const POOL_UT = '7eea3edcaed734bea9cbfc24409ed989';

function poolUrl(kind, date) {
  return (
    `https://push2ex.eastmoney.com/getTopic${kind}Pool?ut=${POOL_UT}&dpt=wz.ztzt` +
    `&Pageindex=0&pagesize=1000&sort=fbt%3Aasc&date=${date}`
  );
}

function sealTime(t) {
  if (t === undefined || t === null) return null;
  const s = String(t).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

function mapPool(p) {
  return {
    code: String(p.c), name: p.n,
    price: typeof p.p === 'number' ? p.p / 1000 : null,
    pct: p.zdp ?? null, amount: p.amount ?? null, floatCap: p.ltsz ?? null,
    turnover: p.hs ?? null, sealFund: p.fund ?? null,
    firstSeal: sealTime(p.fbt), lastSeal: sealTime(p.lbt),
    zhaCount: p.zbc ?? 0, lianban: p.lbc ?? null, industry: p.hybk ?? null,
  };
}

export async function getPool(kind, date) {
  const d = await fetchJSON(poolUrl(kind, date), HEADERS_EM);
  return (d?.data?.pool || []).map(mapPool);
}

// ================= 分时（腾讯 ifzq；累计量差分 + 均价线） =================
function txCode(code) {
  return (/^(6|9)/.test(code) ? 'sh' : 'sz') + code;
}

export async function getMinute(code) {
  const c = txCode(code);
  const d = JSON.parse(await fetchGBK(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${c}`, {}, 9000));
  const node = d?.data?.[c];
  const rows = node?.data?.data || [];
  if (!rows.length) throw new Error('空分时');
  const prevClose = parseFloat(node?.qt?.[c]?.[4]) || null;
  let cumVol = 0, cumAmt = 0;
  const points = rows.map((r) => {
    const f = String(r).split(/\s+/);
    const t = f[0], price = parseFloat(f[1]);
    const vol = Math.max(0, Math.round(parseFloat(f[2]))); // 累计(手) → 差分
    const amount = parseFloat(f[3]) || 0;
    const dVol = vol - cumVol;
    cumVol = vol;
    cumAmt += (price * dVol * 100);
    const avg = cumVol > 0 ? +(cumAmt / (cumVol * 100)).toFixed(2) : price;
    return { t, price, vol: dVol, avg };
  });
  return {
    code: String(code),
    date: node?.data?.date || null,
    prevClose,
    points,
    name: node?.qt?.[c]?.[1] || null,
  };
}

// ================= 隔夜外围（美股三指数走腾讯实时；恒指/日经走新浪；A50 期货） =================
async function tencentGlobal() {
  const txt = await fetchGBK('https://qt.gtimg.cn/q=usIXIC,usDJI,usINX', {}, 8000);
  const nameMap = { IXIC: '纳斯达克', DJI: '道琼斯', INX: '标普500' };
  const out = [];
  for (const m of txt.matchAll(/v_us(\w+)="([^"]*)"/g)) {
    const f = m[2].split('~');
    if (f.length < 33 || !f[3]) continue;
    const price = parseFloat(f[3]);
    out.push({
      key: m[1].toLowerCase(), name: nameMap[m[1]] || f[1], price,
      change: parseFloat(f[31]), pct: parseFloat(f[32]), time: f[30] || null,
    });
  }
  return out;
}

async function sinaGlobal() {
  const txt = await fetchGBK(`https://hq.sinajs.cn/list=int_hangseng,int_nikkei,hf_CHA50CFD`, HEADERS_SINA);
  const out = [];
  for (const m of txt.matchAll(/hq_str_(\w+)="([^"]*)"/g)) {
    const f = m[2].split(',');
    if (m[1].startsWith('int_')) {
      if (f.length < 4) continue;
      out.push({ key: m[1], name: f[0], price: parseFloat(f[1]), change: parseFloat(f[2]), pct: parseFloat(f[3]) });
    } else if (m[1] === 'hf_CHA50CFD') {
      if (f.length < 9) continue;
      const price = parseFloat(f[0]);
      const prev = parseFloat(f[7]);
      out.push({
        key: 'a50', name: '富时A50期货', price,
        change: +(price - prev).toFixed(1),
        pct: prev ? +(((price - prev) / prev) * 100).toFixed(2) : 0,
      });
    }
  }
  return out;
}

const GLOBAL_ORDER = { nasdaq: 0, dji: 1, sp500: 2, a50: 3, int_hangseng: 4, int_nikkei: 5 };

export async function getGlobal() {
  const [tx, sn] = await Promise.all([
    tencentGlobal().catch(() => []),
    sinaGlobal().catch(() => []),
  ]);
  const all = [...tx, ...sn.filter((x) => x.key !== 'int_sp500' && !tx.some((t) => t.name === x.name))];
  return all.sort((a, b) => (GLOBAL_ORDER[a.key] ?? 99) - (GLOBAL_ORDER[b.key] ?? 99));
}

// ================= 7×24 快讯（新浪滚动财经） =================
export async function getNews(num = 30) {
  const d = JSON.parse(
    await fetchText(`https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&num=${num}&page=1`, HEADERS_SINA)
  );
  return (d?.result?.data || []).map((x) => ({
    title: x.title,
    time: x.ctime ? x.ctime * 1000 : null,
    url: x.url || null,
    media: x.media_name || null,
  }));
}

// ================= 龙虎榜（东财数据中心，独立域名不受 push2 风控影响） =================
export async function getLHBCodes(date) {
  // date: YYYYMMDD → yyyy-mm-dd；接口对 == 过滤报错，用 >= 再按日期精确筛选
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  const url =
    'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILS' +
    `&columns=SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_DATE&filter=(TRADE_DATE%3E%3D%27${iso}%27)&pageSize=500&source=WEB`;
  const d = JSON.parse(await fetchText(url, HEADERS_EM, 10000));
  const rows = d?.result?.data || [];
  return rows.filter((x) => String(x.TRADE_DATE || '').startsWith(iso)).map((x) => String(x.SECURITY_CODE));
}

// ================= 美股明星股（隔夜方向 → A股概念映射） =================
export const US_MAP = [
  { key: 'NVDA', map: '算力 / CPO / 液冷' },
  { key: 'AMD', map: '芯片 / 算力' },
  { key: 'TSM', map: '半导体 / 先进制程' },
  { key: 'ASML', map: '光刻机' },
  { key: 'AAPL', map: '苹果链 / 消费电子' },
  { key: 'TSLA', map: '特斯拉链 / 人形机器人' },
  { key: 'MSFT', map: 'AI 应用 / 软件' },
  { key: 'BABA', map: '阿里概念 / 云计算' },
  { key: 'PDD', map: '电商 / 跨境' },
  { key: 'BIDU', map: '百度概念 / AI' },
  { key: 'NIO', map: '新能源车' },
  { key: 'COIN', map: '加密货币概念' },
];

export async function getUSStocks() {
  const q = US_MAP.map((s) => 'us' + s.key).join(',');
  const txt = await fetchGBK(`https://qt.gtimg.cn/q=${q}`, {}, 8000);
  const byKey = new Map();
  for (const m of txt.matchAll(/v_us(\w+)="([^"]*)"/g)) {
    const f = m[2].split('~');
    if (f.length < 5 || !f[3]) continue;
    const price = parseFloat(f[3]), prev = parseFloat(f[4]);
    byKey.set(m[1], {
      key: m[1], name: f[1], price,
      pct: prev ? +(((price - prev) / prev) * 100).toFixed(2) : null,
    });
  }
  return US_MAP.map((s) => ({ ...(byKey.get(s.key) || { key: s.key, name: s.key, price: null, pct: null }), map: s.map }));
}

// ================= 板块轮动（新浪行业板块，一次请求全市场板块涨跌） =================
export async function getSectorBoard() {
  const txt = await fetchGBK('https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php', HEADERS_SINA);
  const json = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1);
  const obj = JSON.parse(json);
  const sectors = Object.values(obj).map((raw) => {
    const f = String(raw).split(',');
    return {
      code: f[0], name: f[1], count: parseInt(f[2], 10) || 0,
      pct: parseFloat(f[5]) || 0, amount: parseFloat(f[7]) || 0,
      leader: f[12] || null, leaderCode: (f[8] || '').replace(/^[a-z]{2}/, ''),
      leaderPct: parseFloat(f[11]) || 0,
    };
  }).filter((s) => s.name);
  return sectors.sort((a, b) => b.pct - a.pct);
}
export const THEME_WORDS = {
  算力AI: ['算力', 'CPO', '光模块', '英伟达', '大模型', 'AI应用', 'OpenAI'],
  机器人: ['机器人', '人形', '具身智能'],
  半导体: ['芯片', '半导体', '光刻', '存储', '晶圆'],
  汽车链: ['汽车', '智能驾驶', '自动驾驶', '车企', '新势力'],
  军工: ['军工', '导弹', '军贸', '国防'],
  医药: ['医药', '创新药', '减肥药', '疫苗', '医疗器械'],
  券商金融: ['券商', '证券', '并购', '金融'],
  地产基建: ['房地产', '地产', '基建', '城改'],
  光伏储能: ['光伏', '硅料', '储能', '风电'],
  锂电: ['锂电', '电池', '固态电池', '锂矿'],
  低空经济: ['低空', 'eVTOL', '无人机'],
  数据要素: ['数据要素', '数据资产', '东数西算'],
  华为链: ['华为', '鸿蒙', '昇腾'],
  黄金有色: ['黄金', '金价', '有色', '稀土'],
  原油: ['原油', '油价', 'OPEC'],
  消费: ['消费', '白酒', '零售', '旅游'],
  农业: ['农业', '种业', '粮食'],
  航运港口: ['航运', '港口', '集运'],
};

export async function getSentiment() {
  const news = await getNews(60);
  const themes = Object.entries(THEME_WORDS).map(([name, words]) => {
    const hits = news.filter((n) => words.some((w) => (n.title || '').includes(w)));
    return { name, count: hits.length, examples: hits.slice(0, 2).map((h) => (h.title || '').slice(0, 40)) };
  }).sort((a, b) => b.count - a.count);
  return { themes: themes.filter((t) => t.count > 0), newsCount: news.length, at: Date.now() };
}
