// 交易计划自动推荐：后台每 60 秒计算一次（带 15s 超时保护），接口读缓存
import { scanAll, reflowScan, auctionScan } from './scan.js';
import { industryOf } from './industries.js';
import { buildPlans } from './review.js';
import { getEarningsForecast } from './em.js';

let planCache = null;       // { plans, autoFrom, at }
let planBusy = false;

export function getPlanCache() {
  return planCache;
}

// 竞价方向强度 → 推荐加成
function dirBoostFn(auction) {
  const dirRank = new Map((auction?.directions || []).map((d, i) => [d.direction, { rank: i + 1, count: d.count }]));
  return (direction) => {
    const r = dirRank.get(direction);
    if (!r) return { boost: 0, label: '' };
    return { boost: [30, 22, 15, 10, 6][r.rank - 1] || 4, label: `竞价方向第${r.rank}强(${r.count}只)` };
  };
}

export async function buildAutoPlans(state) {
  // tick 未就绪时不要算：buildReview 会把空数据算成"震荡"，污染缓存
  if (!state.marketSweep || !state.tick) return { plans: [], autoFrom: [] };
  const scan = scanAll(state.marketSweep);
  const reflow = reflowScan(state.marketSweep, state.pools);
  const auction = state.auctionCache || null;
  const dirBoost = dirBoostFn(auction);

  const cands = [];
  const push = (code, base, baseLabel) => {
    const direction = industryOf(code) || null;
    const { boost, label } = dirBoost(direction);
    cands.push({ code, base, baseLabel, direction, boost, dirLabel: label });
  };
  const ztTop = [...state.pools.zt].sort((a, b) => (b.lianban || 1) - (a.lianban || 1))[0];
  if (ztTop && (ztTop.lianban || 1) >= 2) push(ztTop.code, 40, `空间板 ${ztTop.lianban}板龙头`);
  for (let i = 0; i < Math.min(2, reflow.length); i++) push(reflow[i].code, 32 - i * 8, i === 0 ? '龙头回流预期' : '龙头回流(次选)');
  for (let i = 0; i < Math.min(2, scan.fangliang.length); i++) push(scan.fangliang[i].code, 28 - i * 6, i === 0 ? '底部放量' : '底部放量(次选)');
  if (scan.huita[0]) push(scan.huita[0].code, 26, '缩量回踩');

  cands.sort((a, b) => (b.base + b.boost) - (a.base + a.boost));
  const seen = new Set();
  const autoFrom = [];
  for (const c of cands) {
    if (!seen.has(c.code)) { seen.add(c.code); autoFrom.push({ code: c.code, from: c.dirLabel ? `${c.baseLabel} · ${c.dirLabel}` : c.baseLabel }); }
    if (seen.size >= 3) break;
  }
  const codes = [...seen];
  const plans = await buildPlans(codes, state);
  for (const p of plans) { const m = autoFrom.find((x) => x.code === p.code); if (m) p.from = m.from; }
  return { plans, autoFrom };
}

// 供调度器调用：带 15 秒硬超时（挂起只会丢一轮，绝不拖累接口）
export async function refreshPlanCache(state) {
  if (planBusy) return;
  // 行情未就绪：不写缓存（返回空计划比返回"假震荡"强）
  if (!state.tick || !state.marketSweep) return;
  planBusy = true;
  try {
    const result = await Promise.race([
      buildAutoPlans(state),
      new Promise((res) => setTimeout(() => res(null), 35_000)),
    ]);
    if (result) planCache = { ...result, at: Date.now() };
  } catch (e) {
    console.error('[plan-cache]', e.message);
  } finally {
    planBusy = false;
  }
}

// 指定 codes 的作战卡（手动模式，实时计算带 15s 超时）
export async function buildPlansWithTimeout(codes, state) {
  return Promise.race([
    buildPlans(codes, state),
    new Promise((res) => setTimeout(() => res([]), 15_000)),
  ]);
}
