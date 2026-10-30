// 外盘期货 K 线与实时报价（纳指/标普/道指期货、富时A50期货）+ 美股三大指数现货
//
// 数据源一：新浪外盘期货专用接口（期货，code 形如 hf_NQ）
//  日K  https://stock.finance.sina.com.cn/futures/api/jsonp.php/
//        var%20_X=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=NQ
//  实时 https://hq.sinajs.cn/list=hf_NQ
//  实测可用（2026-10-30），NQ 有 2209 根，最早回溯 2018-04。
//
// 数据源二：腾讯（美股指数现货，code 形如 usIXIC）
//  日K  https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=usIXIC,day,,,N
//  实时 https://qt.gtimg.cn/q=usIXIC
//  实测可用，返回 data["us.IXIC"].day，bars 格式与 A 股/期货一致。
//
// 调研过但失败的源：
//   腾讯 mkline/ifzq kline（hf_NQ）        → "param error"
//   东财 push2his secid=100.NQ/101.NQ/133.NQ → data null（前缀都不对）
//   新浪 getGlobalFuturesMinuteKLine        → "Service not found"
// 所以**只有日K，没有分时/分钟线**——详情页因此只做日K，
// 不做分时 tab（不假装有数据）。
//
// 注意 NQ/ES/YM 的 volume 恒为 0（新浪不提供外盘期货成交量），
// 只有 CHA50CFD 有量。前端量柱对这些代码会显示为空，属数据源限制。

const HEADERS_SINA = { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' };
const HEADERS_TX = { Referer: 'https://gu.qq.com', 'User-Agent': 'Mozilla/5.0' };

// 新浪期货代码 → 展示名；与 em.js 的 FUTURES 保持一致
export const FUTURE_MAP = {
  NQ: '纳斯达克期货',
  ES: '标普500期货',
  YM: '道琼斯期货',
  CHA50CFD: '富时A50期货',
};

// 腾讯美股指数代码 → 展示名
export const INDEX_MAP = {
  IXIC: '纳斯达克',
  DJI: '道琼斯',
  INX: '标普500',
};

async function fetchGBK(url, headers) {
  const r = await fetch(url, { headers: headers || HEADERS_SINA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return new TextDecoder('gbk').decode(await r.arrayBuffer());
}

/** 解析新浪 jsonp：var _X=([...]) 或 var _X={...} */
function parseJsonp(txt) {
  const i = txt.indexOf('=(');
  if (i < 0) throw new Error('非预期的新浪返回');
  return JSON.parse(txt.slice(i + 2, txt.lastIndexOf(')')));
}

const clampBars = (n, dflt = 120) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(400, Math.max(20, Math.floor(v))) : dflt;
};

// ---------------- 期货（新浪） ----------------

/** 拉外盘期货日K，归一化成与 A 股 /api/kline 相同的 bars 格式 */
async function futureKline(symbol, bars) {
  const sym = String(symbol || '').toUpperCase();
  if (!FUTURE_MAP[sym]) throw new Error(`不支持的期货代码: ${sym}`);
  const txt = await fetchGBK(
    `https://stock.finance.sina.com.cn/futures/api/jsonp.php/var%20_K=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=${sym}`,
  );
  const d = parseJsonp(txt);
  if (!Array.isArray(d) || !d.length) throw new Error('空K线');
  return d.slice(-bars).map((b) => [b.date, +b.open, +b.close, +b.high, +b.low, +b.volume || 0]);
}

async function futureQuote(symbol) {
  const sym = String(symbol || '').toUpperCase();
  if (!FUTURE_MAP[sym]) throw new Error(`不支持的期货代码: ${sym}`);
  const txt = await fetchGBK(`https://hq.sinajs.cn/list=hf_${sym}`);
  const m = new RegExp(`hq_str_hf_${sym}="([^"]*)"`).exec(txt);
  if (!m) throw new Error('无行情返回');
  const f = m[1].split(',');
  if (f.length < 9) throw new Error('字段不足');
  const price = parseFloat(f[0]);
  const prev = parseFloat(f[7]);
  if (!price) throw new Error('现价为空');
  return {
    code: `hf_${sym}`,
    name: f[13] || FUTURE_MAP[sym],
    kind: 'future',
    price,
    prevClose: prev || null,
    change: +(price - prev).toFixed(2),
    pct: prev ? +(((price - prev) / prev) * 100).toFixed(2) : 0,
    high: parseFloat(f[4]) || null,
    low: parseFloat(f[5]) || null,
    time: f[6] || null,
    date: f[12] || null,
  };
}

// ---------------- 美股指数现货（腾讯） ----------------

async function indexKline(symbol, bars) {
  const sym = String(symbol || '').toUpperCase();
  if (!INDEX_MAP[sym]) throw new Error(`不支持的美股指数代码: ${sym}`);
  const txt = await fetchGBK(
    `https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=us${sym},day,,,${bars}`,
    HEADERS_TX,
  );
  const j = JSON.parse(txt);
  const day = j?.data?.[`us.${sym}`]?.day;
  if (!Array.isArray(day) || !day.length) throw new Error('空K线');
  return day.map((b) => [b[0], +b[1], +b[2], +b[3], +b[4], +b[5] || 0]);
}

async function indexQuote(symbol) {
  const sym = String(symbol || '').toUpperCase();
  if (!INDEX_MAP[sym]) throw new Error(`不支持的美股指数代码: ${sym}`);
  const txt = await fetchGBK(`https://qt.gtimg.cn/q=us${sym}`, HEADERS_TX);
  const m = new RegExp(`v_us${sym}="([^"]*)"`).exec(txt);
  if (!m) throw new Error('无行情返回');
  const f = m[1].split('~');
  const price = parseFloat(f[3]);
  if (!price) throw new Error('现价为空');
  return {
    code: `us${sym}`,
    name: f[1] || INDEX_MAP[sym],
    kind: 'index',
    price,
    prevClose: null, // 腾讯未提供昨收，由调用方按日K倒数第二根补
    change: parseFloat(f[31]) || null,
    pct: parseFloat(f[32]) || null,
    high: null,
    low: null,
    time: f[30] || null,
    date: null,
  };
}

// ---------------- 统一入口：按 code 前缀分流 ----------------

/** 是否支持看K线的外盘品种 */
export function isKlineable(code) {
  const c = String(code || '');
  if (c.startsWith('hf_')) return !!FUTURE_MAP[c.slice(3).toUpperCase()];
  if (c.startsWith('us')) return !!INDEX_MAP[c.slice(2).toUpperCase()];
  return false;
}

export async function getKline(code, bars = 120) {
  const n = clampBars(bars);
  const c = String(code || '');
  if (c.startsWith('hf_')) return futureKline(c.slice(3), n);
  if (c.startsWith('us')) return indexKline(c.slice(2), n);
  throw new Error(`不支持的外盘代码: ${c}`);
}

export async function getQuote(code) {
  const c = String(code || '');
  if (c.startsWith('hf_')) return futureQuote(c.slice(3));
  if (c.startsWith('us')) return indexQuote(c.slice(2));
  throw new Error(`不支持的外盘代码: ${c}`);
}

