// 全局状态聚合：交易时段感知调度 + 备源扫描 + 涨停溢价/晋级率 + 开仓环境评分
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIndices, getRank, getPool, sinaFullSweep, sourceStatus } from './em.js';
import { ensureHistoryStarted } from './history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DAILY_FILE = path.join(DATA_DIR, 'daily.json');

export const state = {
  tradingDay: null,
  tick: null,
  pools: { zt: [], zb: [], dt: [], prevZt: [], prevDate: null },
  prevAmount: null,
  updatedAt: null,
  marketSweep: null, // 全市场快照（新浪分页扫描，约 15~20 秒一轮）
};

// ---------- 时间工具（北京时间） ----------
function shParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const p = Object.fromEntries(fmt.formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    ymd: `${p.year}${p.month}${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    dow: dowMap[p.weekday] ?? new Date(d).getDay(),
  };
}

export function marketPhase(d = new Date()) {
  const { minutes: t, dow } = shParts(d);
  if (dow === 0 || dow === 6) return 'closed';
  if (t >= 555 && t < 565) return 'auction';
  if (t >= 565 && t < 570) return 'auction_end';
  if ((t >= 570 && t < 690) || (t >= 780 && t < 900)) return 'open';
  return 'closed';
}

const isTradingDow = (dow) => dow >= 1 && dow <= 5;

function candidateTradingDay() {
  let { ymd, dow, minutes } = shParts();
  if (!isTradingDow(dow) || minutes < 555) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    for (let i = 0; i < 10; i++) {
      if (isTradingDow(d.getDay())) {
        ymd = shParts(d).ymd;
        break;
      }
      d.setDate(d.getDate() - 1);
    }
  }
  return ymd;
}

function prevTradingDay(ymd) {
  const y = +ymd.slice(0, 4), m = +ymd.slice(4, 6), dd = +ymd.slice(6, 8);
  const d = new Date(y, m - 1, dd);
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < 10; i++) {
    if (isTradingDow(d.getDay())) {
      const p = shParts(d);
      return p.ymd;
    }
    d.setDate(d.getDate() - 1);
  }
  return ymd;
}

// ---------- 涨停池（今日 + 上一交易日，供溢价/晋级计算） ----------
export async function refreshPools() {
  const day = candidateTradingDay();
  let zt = await getPool('ZT', day);
  if (zt.length === 0) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    for (let i = 0; i < 7 && zt.length === 0; i++) {
      if (isTradingDow(d.getDay())) {
        const prev = shParts(d).ymd;
        zt = await getPool('ZT', prev);
        if (zt.length > 0) break;
      }
      d.setDate(d.getDate() - 1);
    }
  }
  const effectiveDay = zt.length && zt[0] ? day : day; // 池接口按日期取，无需再判
  const [zb, dt] = await Promise.all([getPool('ZB', day), getPool('DT', day)]);
  let prevZt = [];
  const prevDay = prevTradingDay(day);
  try {
    prevZt = await getPool('ZT', prevDay);
    if (prevZt.length === 0) prevZt = [];
  } catch {
    prevZt = [];
  }
  state.tradingDay = day;
  state.pools = { zt, zb, dt, prevZt, prevDate: prevDay };
  return state.pools;
}

// ---------- 情绪标签 ----------
function emotionLabel(zt, zhaRate, maxLianban) {
  if (zt >= 100 && zhaRate < 0.25 && maxLianban >= 5) return '亢奋';
  if (zt >= 60 && zhaRate < 0.3) return '活跃';
  if (zt >= 30) return '一般';
  if (zt >= 12) return '偏冷';
  return '冰点';
}

// ---------- 开仓环境评分卡（0-100，初始启发式权重，后续做成可调） ----------
function envScore({ advancers, decliners, ztCount, dtCount, zhaRate, maxLianban, amountDeltaPct, premiumAvg }) {
  const parts = [];
  const add = (name, weight, score, note) => parts.push({ name, weight, score, note });

  // 1. 大盘趋势 25
  let trend;
  const adv = advancers ?? 0, dec = decliners ?? 0;
  if (adv + dec > 0) {
    const breadth = adv / (adv + dec);
    if (breadth >= 0.6) trend = 25;
    else if (breadth >= 0.5) trend = 18;
    else if (breadth >= 0.4) trend = 12;
    else trend = 5;
    add('涨跌广度', 25, trend, `上涨占比 ${(breadth * 100).toFixed(0)}%`);
  } else add('涨跌广度', 25, 12, '无数据，取中性');

  // 2. 量能 20
  let vol;
  if (amountDeltaPct == null) { vol = 10; add('量能', 20, vol, '昨日基准待生成'); }
  else if (amountDeltaPct >= 5) { vol = 20; add('量能', 20, vol, `放量 ${amountDeltaPct.toFixed(1)}%`); }
  else if (amountDeltaPct >= 0) { vol = 14; add('量能', 20, vol, `温和 ${amountDeltaPct.toFixed(1)}%`); }
  else if (amountDeltaPct >= -10) { vol = 8; add('量能', 20, vol, `缩量 ${amountDeltaPct.toFixed(1)}%`); }
  else { vol = 3; add('量能', 20, vol, `大幅缩量 ${amountDeltaPct.toFixed(1)}%`); }

  // 3. 赚钱效应 25（涨停数+炸板率）
  let eff;
  if (ztCount >= 80 && zhaRate != null && zhaRate < 0.25) eff = 25;
  else if (ztCount >= 50 && zhaRate != null && zhaRate < 0.3) eff = 18;
  else if (ztCount >= 30) eff = 12;
  else if (ztCount >= 12) eff = 6;
  else eff = 2;
  if (dtCount > ztCount && dtCount >= 10) eff = Math.min(eff, 5); // 跌停多于涨停，强制降档
  add('赚钱效应', 25, eff, `涨停 ${ztCount} · 跌停 ${dtCount} · 炸板率 ${zhaRate != null ? (zhaRate * 100).toFixed(0) + '%' : '-'}`);

  // 4. 连板高度 15
  let height;
  if (maxLianban >= 5) height = 15;
  else if (maxLianban === 4) height = 12;
  else if (maxLianban === 3) height = 9;
  else if (maxLianban === 2) height = 6;
  else height = 3;
  add('空间高度', 15, height, `最高 ${maxLianban || 0} 板`);

  // 5. 昨日涨停溢价 15
  let prem;
  if (premiumAvg == null) { prem = 8; add('昨日溢价', 15, prem, '待今日开盘验证'); }
  else if (premiumAvg >= 2) { prem = 15; add('昨日溢价', 15, prem, `平均溢价 +${premiumAvg.toFixed(2)}%`); }
  else if (premiumAvg >= 0) { prem = 9; add('昨日溢价', 15, prem, `平均溢价 ${premiumAvg.toFixed(2)}%`); }
  else if (premiumAvg >= -2) { prem = 4; add('昨日溢价', 15, prem, `平均溢价 ${premiumAvg.toFixed(2)}%`); }
  else { prem = 0; add('昨日溢价', 15, prem, `平均溢价 ${premiumAvg.toFixed(2)}% 亏钱效应`); }

  const total = Math.round(parts.reduce((s, p) => s + p.score, 0));
  let label, advice;
  if (total >= 75) { label = '重仓出击'; advice = '情绪与趋势共振，可上主线龙头，注意分歧日兑现'; }
  else if (total >= 50) { label = '轻仓试错'; advice = '环境尚可，控制仓位打首板或低吸，不追高位板'; }
  else if (total >= 30) { label = '只看低吸'; advice = '偏弱环境，仅做强势股缩量回踩低吸，不打板'; }
  else { label = '空仓观望'; advice = '亏钱效应明显，空仓等冰点后修复信号'; }
  return { total, label, advice, parts };
}

// ---------- 昨日涨停溢价 & 晋级率 ----------
function computePremium(sweepRows, prevZt) {
  if (!sweepRows || !prevZt?.length) return null;
  const map = new Map(sweepRows.rows.map((r) => [r.code, r.pct]));
  const pcts = [];
  for (const z of prevZt) {
    const p = map.get(z.code);
    if (Number.isFinite(p)) pcts.push(p);
  }
  if (pcts.length < 5) return null;
  const sorted = [...pcts].sort((a, b) => a - b);
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const redRate = pcts.filter((p) => p > 0).length / pcts.length;
  return {
    count: pcts.length, avg: +avg.toFixed(2), median: +median.toFixed(2),
    redRate: +(redRate * 100).toFixed(0),
  };
}

function computeJinji(pools) {
  const { zt, prevZt } = pools;
  if (!prevZt?.length || !zt?.length) return [];
  const todayMap = new Map(zt.map((z) => [z.code, z.lianban || 1]));
  const res = [];
  for (let h = 1; h <= 5; h++) {
    const pool = prevZt.filter((z) => (z.lianban || 1) === h);
    if (!pool.length) continue;
    const promoted = pool.filter((z) => (todayMap.get(z.code) || 0) === h + 1).length;
    res.push({ from: h, to: h + 1, num: promoted, den: pool.length, rate: +((promoted / pool.length) * 100).toFixed(0) });
  }
  return res;
}

// ---------- 情绪快照 ----------
export async function refreshTick() {
  const [idxRes, gainRes, vrRes, amtRes] = await Promise.all([
    getIndices(),
    getRank('f3'),
    getRank('f10'),
    getRank('f6'),
  ]);
  const indices = idxRes.data;
  const sh = indices.find((i) => i.code === '000001');
  const sz = indices.find((i) => i.code === '399001');
  const sum = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a + b : Number.isFinite(a) ? a : Number.isFinite(b) ? b : null);
  const amount2m = sum(sh?.amount, sz?.amount);

  let advancers = sum(sh?.advancers, sz?.advancers);
  let decliners = sum(sh?.decliners, sz?.decliners);
  let flat = sum(sh?.flat, sz?.flat);
  const sweep = state.marketSweep;
  if (advancers == null && sweep && Date.now() - sweep.updatedAt < 5 * 60_000) {
    advancers = sweep.advancers;
    decliners = sweep.decliners;
    flat = sweep.flat;
  }

  const { zt, zb } = state.pools;
  const ztCount = zt.length;
  const zbCount = zb.length;
  const zhaRate = ztCount + zbCount > 0 ? zbCount / (ztCount + zbCount) : null;
  const maxLianban = zt.reduce((m, x) => Math.max(m, x.lianban || 1), 0);
  const dist = {};
  for (const x of zt) {
    const n = Math.min(x.lianban || 1, 10);
    dist[n] = (dist[n] || 0) + 1;
  }

  const premium = computePremium(sweep, state.pools.prevZt);
  const jinji = computeJinji(state.pools);

  // 涨跌分布 13 档（全市场扫描新鲜时计算）
  let dist13 = null;
  if (sweep && Date.now() - sweep.updatedAt < 10 * 60_000) {
    const buckets = [
      ['跌停附近', (p) => p <= -9.7], ['跌7-10', (p) => p > -9.7 && p <= -7], ['跌5-7', (p) => p > -7 && p <= -5],
      ['跌3-5', (p) => p > -5 && p <= -3], ['跌1-3', (p) => p > -3 && p <= -1], ['微跌', (p) => p > -1 && p < 0],
      ['平盘', (p) => p === 0], ['微涨', (p) => p > 0 && p < 1], ['涨1-3', (p) => p >= 1 && p < 3],
      ['涨3-5', (p) => p >= 3 && p < 5], ['涨5-7', (p) => p >= 5 && p < 7], ['涨7-10', (p) => p >= 7 && p < 9.7],
      ['涨停附近', (p) => p >= 9.7],
    ];
    dist13 = buckets.map(([label, fn]) => ({ label, count: sweep.rows.filter((r) => Number.isFinite(r.pct) && fn(r.pct)).length }));
  }

  // 昨日涨停股今日表现明细（溢价明细）
  let premiumDetail = null;
  if (sweep && state.pools.prevZt?.length) {
    const map = new Map(sweep.rows.map((r) => [r.code, r]));
    premiumDetail = state.pools.prevZt
      .map((z) => {
        const r = map.get(z.code);
        return r ? { code: z.code, name: z.name, lianban: z.lianban || 1, pct: r.pct, price: r.price } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.pct - a.pct);
  }

  const env = envScore({
    advancers, decliners, ztCount,
    dtCount: state.pools.dt.length,
    zhaRate, maxLianban,
    amountDeltaPct: state.prevAmount && amount2m > 0 ? (amount2m / state.prevAmount - 1) * 100 : null,
    premiumAvg: premium ? premium.avg : null,
  });

  const { minutes, dow } = shParts();
  if (amount2m > 0 && isTradingDow(dow) && minutes >= 905) saveDaily(state.tradingDay, amount2m);

  state.tick = {
    phase: marketPhase(),
    tradingDay: state.tradingDay,
    indices,
    amount2m,
    prevAmount: state.prevAmount,
    amountDeltaPct: state.prevAmount && amount2m > 0 ? (amount2m / state.prevAmount - 1) * 100 : null,
    advancers, decliners, flat,
    ztCount,
    dtCount: state.pools.dt.length,
    zbCount,
    zhaRate,
    maxLianban,
    lianbanDist: dist,
    emotionLabel: emotionLabel(ztCount, zhaRate ?? 0, maxLianban),
    premium, jinji, env, dist13, premiumDetail,
    gainers: gainRes.data,
    volRatio: vrRes.data,
    amountTop: amtRes.data,
    volRankDegraded: vrRes.degraded,
    sourceFallback: vrRes.degraded || !!state.marketSweepFresh,
    updatedAt: Date.now(),
  };
  return state.tick;
}

// ---------- 全市场扫描（常开：交易时段 5 分钟一轮，收盘 30 分钟一轮） ----------
let sweepInFlight = false;
export async function runSweep() {
  if (sweepInFlight) return;
  sweepInFlight = true;
  try {
    const prevCount = state.marketSweep?.rows?.length || 0;
    state.marketSweep = await sinaFullSweep();
    if (prevCount === 0) console.log('[sweep] 首次全市场快照：', state.marketSweep.total, '只');
  } catch (e) {
    console.error('[sweep]', e.message);
  } finally {
    sweepInFlight = false;
  }
}

Object.defineProperty(state, 'marketSweepFresh', {
  get() {
    return state.marketSweep && Date.now() - state.marketSweep.updatedAt < 5 * 60_000;
  },
});

function saveDaily(day, amount) {
  try {
    let cur = {};
    if (fs.existsSync(DAILY_FILE)) cur = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf8'));
    if (cur.lastFullDay === day && cur.amount) {
      if (amount > cur.amount) {
        cur.amount = amount;
        fs.writeFileSync(DAILY_FILE, JSON.stringify(cur));
      }
      return;
    }
    if (cur.lastFullDay !== day && cur.amount) state.prevAmount = cur.amount;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DAILY_FILE, JSON.stringify({ lastFullDay: day, amount }));
  } catch {
    /* 落盘失败不影响行情 */
  }
}

export function loadDaily() {
  try {
    const cur = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf8'));
    if (cur.lastFullDay && cur.amount) {
      const { ymd, dow } = shParts();
      if (cur.lastFullDay !== ymd && isTradingDow(dow)) state.prevAmount = cur.amount;
    }
  } catch {
    /* 无历史文件 */
  }
}

// ---------- 调度 ----------
function phaseIntervals() {
  const phase = marketPhase();
  if (phase === 'closed') return { tick: 60_000, pools: 300_000, sweep: 30 * 60_000 };
  return { tick: 3_000, pools: 10_000, sweep: 5 * 60_000 };
}

export function startScheduler(broadcast) {
  loadDaily();
  let poolsLoaded = false;
  let historyKicked = false;

  async function loopTick() {
    try {
      await refreshTick();
      if (!poolsLoaded) await refreshPools();
      broadcast('tick', state.tick);
    } catch (e) {
      console.error('[tick]', e.message);
    }
    setTimeout(loopTick, phaseIntervals().tick);
  }

  async function loopPools() {
    try {
      await refreshPools();
      poolsLoaded = true;
      broadcast('pools', state.pools);
    } catch (e) {
      console.error('[pools]', e.message);
    }
    setTimeout(loopPools, phaseIntervals().pools);
  }

  async function loopSweep() {
    await new Promise((r) => setTimeout(r, 10_000));
    do {
      await runSweep();
      if (!historyKicked && state.marketSweep) {
        historyKicked = true;
        ensureHistoryStarted(() => (state.marketSweep ? state.marketSweep.rows.map((r) => r.code) : null));
      }
      await new Promise((r) => setTimeout(r, phaseIntervals().sweep));
    } while (true);
  }

  async function loopReview() {
    await new Promise((r) => setTimeout(r, 30_000));
    do {
      try {
        saveReviewIfNeeded(state, marketPhase());
      } catch { /* 不影响行情 */ }
      await new Promise((r) => setTimeout(r, 5 * 60_000));
    } while (true);
  }

  loopTick();
  loopPools();
  loopSweep();
  loopReview();
}
