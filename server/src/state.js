// 全局状态聚合 + 交易时段感知的轮询调度 + 备源全市场扫描
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIndices, getRank, getPool, sinaFullSweep, sourceStatus } from './em.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DAILY_FILE = path.join(DATA_DIR, 'daily.json');

export const state = {
  tradingDay: null, // 当前数据对应的交易日 YYYYMMDD
  tick: null,       // 情绪快照（3 秒级）
  pools: { zt: [], zb: [], dt: [] },
  prevAmount: null, // 上一交易日两市成交额（用于今日量能对比）
  updatedAt: null,
  marketSweep: null, // 备源全市场扫描结果（涨跌家数兜底）
};

// ---------- 时间工具（统一按北京时间） ----------
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

// 市场阶段：auction 9:15-9:25 集合竞价 / auction_end 9:25-9:30 / open 交易中 / closed
export function marketPhase(d = new Date()) {
  const { minutes: t, dow } = shParts(d);
  if (dow === 0 || dow === 6) return 'closed';
  if (t >= 555 && t < 565) return 'auction';
  if (t >= 565 && t < 570) return 'auction_end';
  if ((t >= 570 && t < 690) || (t >= 780 && t < 900)) return 'open';
  return 'closed';
}

const isTradingDow = (dow) => dow >= 1 && dow <= 5;

// 最近一个可能的交易日（不识别法定假日，靠"涨停池为空"兜底回退一天）
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

// ---------- 涨停池 ----------
export async function refreshPools() {
  let day = candidateTradingDay();
  let zt = await getPool('ZT', day);
  if (zt.length === 0) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    for (let i = 0; i < 7 && zt.length === 0; i++) {
      if (isTradingDow(d.getDay())) {
        const prev = shParts(d).ymd;
        zt = await getPool('ZT', prev);
        if (zt.length > 0) day = prev;
      }
      d.setDate(d.getDate() - 1);
    }
  }
  const [zb, dt] = await Promise.all([getPool('ZB', day), getPool('DT', day)]);
  state.tradingDay = day;
  state.pools = { zt, zb, dt };
  return state.pools;
}

// ---------- 情绪快照 ----------
function emotionLabel(zt, zhaRate, maxLianban) {
  // 初始启发式阈值，后续做成可调参数
  if (zt >= 100 && zhaRate < 0.25 && maxLianban >= 5) return '亢奋';
  if (zt >= 60 && zhaRate < 0.3) return '活跃';
  if (zt >= 30) return '一般';
  if (zt >= 12) return '偏冷';
  return '冰点';
}

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

  // 涨跌家数：东财指数自带；备源时用全市场扫描兜底（5 分钟内有效）
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

  // 收盘后把当日两市成交额落盘，作为次日"昨日量能"基准
  const { minutes, dow } = shParts();
  if (amount2m > 0 && isTradingDow(dow) && minutes >= 905) saveDaily(state.tradingDay, amount2m);

  state.tick = {
    phase: marketPhase(),
    indices,
    amount2m,
    prevAmount: state.prevAmount,
    amountDeltaPct: state.prevAmount && amount2m > 0 ? (amount2m / state.prevAmount - 1) * 100 : null,
    advancers,
    decliners,
    flat,
    ztCount,
    dtCount: state.pools.dt.length,
    zbCount,
    zhaRate,
    maxLianban,
    lianbanDist: dist,
    emotionLabel: emotionLabel(ztCount, zhaRate ?? 0, maxLianban),
    gainers: gainRes.data,
    volRatio: vrRes.data,
    amountTop: amtRes.data,
    volRankDegraded: vrRes.degraded, // 备源无量比 → 换手榜
    sourceFallback: vrRes.degraded || state.marketSweepFresh,
    updatedAt: Date.now(),
  };
  return state.tick;
}

// ---------- 备源全市场扫描（约 70 页，15~20 秒） ----------
let sweepInFlight = false;
export async function runSweepIfNeeded() {
  if (sweepInFlight || Date.now() < healthBlockUntil()) return;
  const st = sourceStatus();
  if (!st.emBlocked) return; // 东财正常时不需要扫描兜底
  sweepInFlight = true;
  try {
    console.log('[sweep] 备源全市场扫描开始…');
    state.marketSweep = await sinaFullSweep();
    console.log('[sweep] 完成：', state.marketSweep.total, '只 · 涨', state.marketSweep.advancers, '跌', state.marketSweep.decliners);
  } catch (e) {
    console.error('[sweep]', e.message);
  } finally {
    sweepInFlight = false;
  }
}
function healthBlockUntil() {
  return 0; // 预留：扫描自身的退避窗口
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

// ---------- 调度循环（按交易时段自适应频率） ----------
function phaseIntervals() {
  const phase = marketPhase();
  if (phase === 'closed') return { tick: 60_000, pools: 300_000, sweep: 10 * 60_000 };
  return { tick: 3_000, pools: 10_000, sweep: 3 * 60_000 };
}

export function startScheduler(broadcast) {
  loadDaily();
  let poolsLoaded = false;

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
    // 首次 30 秒后就尝试一次（东财封禁时尽快兜底），之后按节奏来
    await new Promise((r) => setTimeout(r, 30_000));
    do {
      await runSweepIfNeeded();
      await new Promise((r) => setTimeout(r, phaseIntervals().sweep));
    } while (true);
  }

  loopTick();
  loopPools();
  loopSweep();
}
