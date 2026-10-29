// 异动监控（服务端）：全市场帧对比 + 落盘 + 复盘
//
// 原实现只在浏览器内存里对比 tick 的三张榜单（各 50 只 = 150 只覆盖），
// 带来三个问题：
//   1. 覆盖面只有 150/5222 只，绝大多数异动看不到
//   2. 事件只在 React state 里，刷新页面全部丢失
//   3. 没有任何持久化，无法复盘昨日盘中异动
//
// 现在改为服务端主导：
//   - 每轮全市场快照（sweep）与上一轮对比，覆盖全部 5000+ 只
//   - 检测 急拉/跳水/触板/跌停/炸板/封单骤减，记录 from→to 与真实间隔
//   - 按日落盘 server/data/anomaly/YYYYMMDD.jsonl（追加写，避免整文件重写）
//   - 提供当日实时 + 历史日期 + 按日复盘聚合
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'data', 'anomaly');

const DELTA = 1.5;          // 相邻两轮涨跌幅变化阈值（%）
const MAX_PER_ROUND = 200;  // 单轮最多记录条数，防止极端行情写爆文件
const LIMIT_UP = 9.7;       // 涨停判定
const LIMIT_DOWN = -9.7;    // 跌停判定

export function dayOf(ts = Date.now()) {
  const bj = new Date(ts + 8 * 3600 * 1000);
  const y = bj.getUTCFullYear();
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bj.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function fileOf(day) {
  return path.join(DIR, `${day}.jsonl`);
}

// 上一帧快照：code -> { pct, price }
let prevFrame = null;
let prevFrameAt = 0;
// 上一帧涨停池封单：code -> sealFund
let prevSeal = null;
// 上一帧炸板池 code 集合（炸板池是全量快照，需差集判新增）
let prevZbSet = null;

function append(day, events) {
  if (!events.length) return;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFileSync(fileOf(day), lines, 'utf8');
  } catch { /* 落盘失败不影响监控 */ }
}

/**
 * 全市场帧对比（每轮 sweep 后调用）
 * @param {Array} rows  state.marketSweep.rows
 * @param {object} pools state.pools
 * @returns {Array} 本轮新事件（也已落盘）
 */
export function detectAnomaly(rows, pools, persist = true) {
  if (!rows?.length) return [];
  const now = Date.now();
  const day = dayOf(now);

  const cur = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.pct)) continue;
    cur.set(r.code, { name: r.name, pct: r.pct, price: r.price });
  }

  const fresh = [];
  const intervalMs = prevFrameAt ? now - prevFrameAt : null;
  const hasPrev = !!prevFrame && intervalMs != null;

  if (hasPrev) {
    for (const [code, info] of cur) {
      const p = prevFrame.get(code);
      if (!p) continue;
      const d = info.pct - p.pct;
      if (Math.abs(d) < DELTA) continue;
      fresh.push({
        t: now, code, name: info.name,
        type: d > 0 ? '急拉' : '跳水',
        from: +p.pct.toFixed(2), to: +info.pct.toFixed(2),
        delta: +d.toFixed(2), price: info.price, intervalMs,
      });
    }
    // 触板 / 跌停：本轮新达到
    for (const [code, info] of cur) {
      const p = prevFrame.get(code);
      if (!p) continue;
      if (p.pct < LIMIT_UP && info.pct >= LIMIT_UP) {
        fresh.push({ t: now, code, name: info.name, type: '触板', from: +p.pct.toFixed(2), to: +info.pct.toFixed(2), delta: +(info.pct - p.pct).toFixed(2), price: info.price, intervalMs });
      }
      if (p.pct > LIMIT_DOWN && info.pct <= LIMIT_DOWN) {
        fresh.push({ t: now, code, name: info.name, type: '跌停', from: +p.pct.toFixed(2), to: +info.pct.toFixed(2), delta: +(info.pct - p.pct).toFixed(2), price: info.price, intervalMs });
      }
    }
  }

  // 炸板 / 封单骤减：来自东财涨停/炸板池，比扫全市场更准
  // 注意炸板池是全量快照（不是增量），必须与上一轮的集合做差集，
  // 只记录"新出现在炸板池"的票，否则每轮都会重复记录同样的票
  if (pools) {
    const zbNow = new Set((pools.zb || []).map((s) => s.code));
    if (prevZbSet) {
      for (const s of pools.zb || []) {
        if (prevZbSet.has(s.code)) continue;
        fresh.push({
          t: now, code: s.code, name: s.name, type: '炸板',
          from: null, to: s.pct != null ? +s.pct.toFixed(2) : null,
          delta: null, price: s.price, intervalMs,
          firstSeal: s.firstSeal || null, zhaCount: s.zhaCount || 0,
        });
      }
    }
    prevZbSet = zbNow;
    const sealNow = new Map((pools.zt || []).map((s) => [s.code, s.sealFund || 0]));
    if (prevSeal) {
      for (const s of pools.zt || []) {
        const before = prevSeal.get(s.code);
        const nowSeal = s.sealFund || 0;
        // 封单缩水 >30% 且绝对值 >3000万 → 撤单预警
        if (before && before > 3e6 && nowSeal > 0 && nowSeal < before * 0.7) {
          fresh.push({
            t: now, code: s.code, name: s.name, type: '封单骤减',
            from: null, to: s.pct != null ? +s.pct.toFixed(2) : null,
            delta: null, price: s.price, intervalMs,
            sealBefore: +(before / 1e8).toFixed(2), sealNow: +(nowSeal / 1e8).toFixed(2),
          });
        }
      }
    }
    prevSeal = sealNow;
  }

  prevFrame = cur;
  prevFrameAt = now;

  // 按涨跌幅绝对值排序，强的优先；限制单轮条数
  fresh.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  const capped = fresh.slice(0, MAX_PER_ROUND);
  if (persist) append(day, capped);
  return capped;
}

/** 读取某日事件 */
export function readDay(day) {
  let txt;
  try {
    txt = fs.readFileSync(fileOf(day), 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* 跳过半行 */ }
  }
  return out;
}

/** 当日事件（供实时展示） */
export function todayEvents() {
  return readDay(dayOf());
}

/** 有异动记录的日期列表（倒序） */
export function anomalyDates() {
  try {
    return fs.readdirSync(DIR)
      .filter((f) => /^\d{8}\.jsonl$/.test(f))
      .map((f) => f.replace('.jsonl', ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * 复盘聚合：把某日异动统计成"第二天能用"的结论
 * @param {string} day yyyyMMdd
 */
export function buildAnomalyReview(day) {
  const events = readDay(day);
  if (!events.length) {
    return { date: day, total: 0, byType: {}, byHour: [], topMovers: [], zhaTop: [], sealDrop: [], note: '该日无异动记录' };
  }

  const byType = {};
  const byHour = new Map();
  const moverMax = new Map(); // code -> |delta| 最大的那条（同一只票只留最强一次）
  const zha = [];
  const sealDrop = [];

  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    const h = new Date(e.t + 8 * 3600 * 1000).getUTCHours();
    byHour.set(h, (byHour.get(h) || 0) + 1);
    if (e.type === '急拉' || e.type === '跳水') {
      const prev = moverMax.get(e.code);
      if (!prev || Math.abs(e.delta) > Math.abs(prev.delta)) moverMax.set(e.code, e);
    }
    if (e.type === '炸板') zha.push(e);
    if (e.type === '封单骤减') sealDrop.push(e);
  }

  const topMovers = [...moverMax.values()]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 30)
    .map((e) => ({
      code: e.code, name: e.name, type: e.type,
      delta: e.delta, from: e.from, to: e.to, price: e.price, time: e.t,
      strong: Math.abs(e.delta) >= 3,
    }));

  return {
    date: day,
    total: events.length,
    byType,
    byHour: [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([h, n]) => ({ hour: h, count: n })),
    topMovers,
    zhaTop: zha.sort((a, b) => b.t - a.t).slice(0, 20).map((e) => ({
      code: e.code, name: e.name, pct: e.to, firstSeal: e.firstSeal, zhaCount: e.zhaCount, time: e.t,
    })),
    sealDrop: sealDrop.slice(-20).reverse().map((e) => ({
      code: e.code, name: e.name, sealBefore: e.sealBefore, sealNow: e.sealNow, pct: e.to, time: e.t,
    })),
    note: '复盘口径：全市场相邻两轮快照对比；急拉/跳水=涨跌幅变化>=1.5%，触板/跌停=本轮新达到，炸板与封单骤减来自东财涨停/炸板池。',
  };
}
