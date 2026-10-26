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
const fetchGBK = async (url, headers, t = 8000) => new TextDecoder('gbk').decode(await (await fetch(url, { headers, signal: AbortSignal.timeout(t) })).arrayBuffer());

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
