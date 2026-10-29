// E1 深度复盘单测：node scripts/test-review-deep.mjs
import { buildReview } from '../server/src/review.js';
import { cycleStage } from '../server/src/emotion.js';

let pass = 0, fail = 0;
const eq = (a, b, label) => {
  const same = a instanceof Set && b instanceof Set
    ? a.size === b.size && [...a].every((x) => b.has(x))
    : JSON.stringify(a) === JSON.stringify(b);
  if (same) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n        got  ${JSON.stringify(a)}\n        want ${JSON.stringify(b)}`); }
};

const zt = (code, name, lianban, industry, sealFund = 1e8, zhaCount = 0, firstSeal = '09:31:00') =>
  ({ code, name, lianban, industry, sealFund, zhaCount, firstSeal, pct: 10, amount: 1e8, floatCap: 1e9, turnover: 5 });
const zb = (code, name, lianban, industry, zhaCount, firstSeal, pct = 5) =>
  ({ code, name, lianban, industry, zhaCount, firstSeal, pct, amount: 1e8, floatCap: 1e9, turnover: 8, sealFund: null });

function mkState(pools, extra = {}) {
  return {
    tradingDay: '20261029',
    tick: {
      ztCount: pools.zt.length, dtCount: 0, zbCount: pools.zb.length,
      zhaRate: pools.zb.length / (pools.zt.length + pools.zb.length),
      maxLianban: pools.zt.reduce((m, z) => Math.max(m, z.lianban || 1), 0),
      lianbanDist: {}, indices: [{ code: '1', name: '上证' }], env: { total: 50, label: '轻仓试错', advice: 'x', parts: [] },
      amount2m: 1e12, advancers: 2000, decliners: 2000, flat: 0,
      ...extra,
    },
    pools,
    marketSweep: null,
    sentiment: null,
    sectors: null,
  };
}

console.log('\n[1] 题材生命周期：各题材独立判定');
{
  const pools = {
    zt: [
      zt('001', '甲', 5, '算力', 3e8), zt('002', '乙', 4, '算力', 2e8), zt('003', '丙', 3, '算力', 1e8),
      zt('004', '丁', 2, '医药'), zt('005', '戊', 1, '医药'),
      zt('006', '己', 1, '银行'),
    ],
    zb: [zb('007', '庚', 3, '算力', 4, '09:35:00'), zb('008', '辛', 1, '汽车', 1, '09:40:00')],
    prevZt: [],
  };
  const r = buildReview(mkState(pools), 'closed');
  const lc = r.deep.lifecycle;
  eq(lc.length > 0, true, '有生命周期数据');
  const byInd = Object.fromEntries(lc.map((x) => [x.industry, x]));
  eq(byInd['算力'].phase, '高潮', '算力 6家涨停+5板 → 高潮');
  eq(byInd['算力'].maxLianban, 5, '算力最高板 5');
  eq(byInd['医药'].phase, '启动', '医药 2家+最高2板 → 启动');
  eq(byInd['银行'].phase, '启动', '银行 1家首板 → 启动');
  eq(byInd['汽车'].phase, '分歧', '汽车 0涨停1炸板 → 分歧');
}

console.log('\n[2] 题材生命周期：龙头断板 → 退潮');
{
  const pools = {
    zt: [zt('001', '甲', 2, '算力')],
    zb: [],
    prevZt: [zt('009', '旧龙头', 4, '医药')],
  };
  const r = buildReview(mkState(pools), 'closed');
  const med = r.deep.lifecycle.find((x) => x.industry === '医药');
  eq(med?.phase, '退潮', '医药昨日涨停今日全断板 → 退潮');
  eq(med?.broken, 1, 'broken = 1');
}

console.log('\n[3] 炸板归因：五类分类正确');
{
  const pools = {
    zt: [zt('001', '甲', 3, '算力')],
    zb: [
      zb('101', '高位A', 4, '算力', 2, '10:00:00'),   // 高位分歧
      zb('102', '板块B', 1, '汽车', 1, '09:35:00'),   // 板块退潮（同行业2只）
      zb('103', '板块C', 2, '汽车', 3, '11:00:00'),   // 也属汽车 → 板块退潮优先
      zb('104', '弱封D', 1, '化工', 5, '13:00:00'),   // 封板意愿弱
      zb('105', '试盘E', 1, '光伏', 1, '09:33:00'),   // 试盘型（早盘+1次）
      zb('106', '失败F', 1, '银行', 2, '14:00:00'),   // 承接失败
    ],
    prevZt: [],
  };
  const r = buildReview(mkState(pools), 'closed');
  const a = r.deep.zhaAttr;
  eq(a.highDivergence.stocks.map((s) => s.code), ['101'], '高位分歧 = 101');
  eq(a.sectorFade.stocks.map((s) => s.code).sort(), ['102', '103'], '板块退潮 = 102/103（同行业2只）');
  eq(a.weakSeal.stocks.map((s) => s.code), ['104'], '封板意愿弱 = 104（开板5次）');
  eq(a.trialPan.stocks.map((s) => s.code), ['105'], '试盘型 = 105（早盘+开1次）');
  eq(a.totalFail.stocks.map((s) => s.code), ['106'], '承接失败 = 106');
  eq(a.highDivergence.stocks[0].why.includes('4 板'), true, '归因文案含连板高度');
}

console.log('\n[4] 明日主线推演：有涨停支撑 vs 仅观察');
{
  const pools = {
    zt: [zt('001', '甲', 4, '算力'), zt('002', '乙', 3, '算力'), zt('003', '丙', 2, '算力')],
    zb: [], prevZt: [],
  };
  const state = mkState(pools);
  state.sentiment = { themes: [{ name: '算力', count: 3, examples: [] }, { name: '机器人', count: 2, examples: [] }] };
  state.sectors = [{ name: '算力', pct: 4.5 }, { name: '新能源', pct: 2 }];
  const r = buildReview(state, 'closed');
  const f = r.deep.forecast;
  eq(f.mainlines.length > 0, true, '有主线');
  eq(f.mainlines[0].direction, '算力', '算力是主线首推（涨停+词频+涨幅三重支撑）');
  eq(f.mainlines[0].score > 20, true, '算力评分 > 20');
  eq(f.watchOnly.some((w) => w.direction === '机器人'), true, '机器人只有词频无涨停 → 仅观察');
  eq(f.watchOnly.some((w) => w.direction === '新能源'), true, '新能源只有涨幅无涨停 → 仅观察');
  eq(f.watchOnly.some((w) => w.direction === '算力'), false, '算力不在仅观察里');
}

console.log('\n[5] 推演加分/扣分：退潮题材被压低');
{
  const pools = {
    zt: [zt('001', '甲', 2, '算力'), zt('002', '乙', 1, '算力')],
    zb: [], prevZt: [zt('009', '旧', 3, '医药')],
  };
  const r = buildReview(mkState(pools), 'closed');
  const f = r.deep.forecast;
  eq(f.mainlines.some((m) => m.direction === '算力'), true, '算力仍是主线');
  const med = f.mainlines.find((m) => m.direction === '医药');
  eq(med, undefined, '医药已退潮（无涨停）不进主线');
}

console.log('\n[6] 无 sentiment/sectors 时不抛错（降级）');
{
  const pools = { zt: [zt('001', '甲', 3, '算力')], zb: [], prevZt: [] };
  const r = buildReview(mkState(pools), 'closed');
  eq(r.deep.forecast.mainlines.length, 1, '仅靠涨停梯队也能推演');
  eq(r.deep.forecast.mainlines[0].direction, '算力', '主线 = 算力');
}

console.log('\n[7] 空池边界');
{
  const r = buildReview(mkState({ zt: [], zb: [], prevZt: [] }), 'closed');
  eq(r.deep.lifecycle.length, 0, '空池 → 无生命周期');
  eq(Object.values(r.deep.zhaAttr).every((b) => b.count === 0), true, '空池 → 归因全 0');
  eq(r.deep.forecast.mainlines.length, 0, '空池 → 无主线');
  eq(r.strategy.length > 0, true, 'strategy 仍有风控等基础条目');
}

const truthy = (c, label) => { if (c) { pass++; console.log(`  ok   ${label}`); } else { fail++; console.log(`  FAIL ${label}`); } };

// ================= 明日应对方案（综合 + 失败预案）=================
console.log('\n[16] tomorrowPlan 结构与字段完整性');
{
  const r = buildReview(mkState({
    zt: [zt('001', 'KA', 4, 'X', 3e8, 1e10, '09:31:00'), zt('002', 'SEC', 2, 'X', 1e8, 1e10, '09:31:00'), zt('003', 'FIRST', 1, 'X', 5e7, 1e9, '10:00:00')],
    zb: [], prevZt: [],
  }), 'closed');
  const p = r.tomorrowPlan;
  truthy(!!p, 'tomorrowPlan 存在');
  if (p) {
  for (const k of ['verdict', 'directions', 'targets', 'contingency', 'risk', 'text']) {
    truthy(k in p, `tomorrowPlan.${k} 存在`);
  }
  truthy(['freeze', 'hot', 'warm', 'cool'].includes(p.verdict.level), 'verdict.level 四档之一');
  truthy(typeof p.verdict.action === 'string' && p.verdict.action.length > 0, 'verdict.action 非空');
  truthy(Array.isArray(p.verdict.reasons) && p.verdict.reasons.length >= 2, 'verdict.reasons 有多条依据');
  }
  truthy(Array.isArray(p.directions.go), 'directions.go 是数组');
  truthy(Array.isArray(p.directions.avoid), 'directions.avoid 是数组');
  truthy(Array.isArray(p.targets), 'targets 是数组');
  truthy(Array.isArray(p.contingency), 'contingency 是数组');
  truthy(Array.isArray(p.risk) && p.risk.length >= 3, 'risk 至少 3 条');
}

console.log('\n[17] targets 带龙头分层角色与质量分');
{
  const r = buildReview(mkState({
    zt: [zt('001', 'KA', 4, 'X', 3e8, 1e10, '09:31:00'), zt('001B', 'KB', 4, 'X', 1e8, 1e10, '09:31:00'), zt('002', 'SEC', 2, 'X', 1e8, 1e10, '09:31:00')],
    zb: [], prevZt: [],
  }), 'closed');
  const ts = r.tomorrowPlan.targets;
  truthy(ts.some((x) => x.role === '卡位龙'), '含卡位龙');
  truthy(ts.some((x) => x.role === '龙二（接力候选）'), '含龙二');
  const kawci = ts.find((x) => x.role === '卡位龙');
  truthy(kawci && kawci.quality > 0, '卡位龙带质量分');
  truthy(kawci && !!kawci.nextDay, '卡位龙带次日预期');
  truthy(ts.every((x) => x.why && x.why.length > 0), '每个标的都有理由');
}

console.log('\n[18] 失败预案：基础项必在，条件项按信号出现');
{
  const r = buildReview(mkState({
    zt: [zt('001', 'KA', 3, 'X', 1e8, 1e10, '09:31:00')],
    zb: [], prevZt: [],
  }), 'closed');
  const c = r.tomorrowPlan.contingency;
  const triggers = c.map((x) => x.trigger);
  truthy(triggers.some((t2) => t2.includes('量比')), '含竞价量比预案');
  truthy(triggers.some((t2) => t2.includes('炸板')), '含打板炸板预案');
  truthy(triggers.some((t2) => t2.includes('跌破')), '含低吸止损预案');
  truthy(triggers.some((t2) => t2.includes('连亏')), '含连亏熔断预案');
  truthy(c.every((x) => x.action && x.detail), '每条预案都有 action + detail');
}

console.log('\n[19] 龙头断板 → 环境定性 freeze + 专属预案');
{
  const r = buildReview(mkState({
    zt: [zt('001', 'LOW', 3, 'X', 1e8, 1e10, '09:31:00')],
    zb: [], prevZt: [zt('009', 'TOP', 5, 'X', 1e8, 1e10, '09:31:00')],
  }), 'closed');
  const p = r.tomorrowPlan;
  eq(p.verdict.level, 'freeze', '高度真空 → freeze');
  eq(p.verdict.action, '空仓观望', '定性空仓观望');
  truthy(p.contingency.some((x) => x.trigger.includes('总龙头')), '含总龙头断板预案');
  truthy(p.verdict.reasons.some((x) => x.includes('高度下降')), 'reasons 提及高度下降');
}

console.log('\n[20] 强环境 + 发酵期 → 重仓出击');
{
  const r = buildReview(mkState({
    zt: [zt('001', 'A', 4, 'X', 3e8, 1e10, '09:31:00'), zt('002', 'B', 3, 'X', 2e8, 1e10, '09:31:00'), zt('003', 'C', 2, 'X', 1e8, 1e10, '09:31:00'), zt('004', 'D', 1, 'X', 5e7, 1e9, '10:00:00')],
    zb: [], prevZt: [zt('001', 'A', 3, 'X', 1e8, 1e10, '09:31:00')],
    tickExtra: { env: { total: 80, label: '重仓出击', advice: 'x', parts: [] } },
  }), 'closed');
  const p = r.tomorrowPlan;
  truthy(p.verdict.level === 'hot' || p.verdict.level === 'warm', `环境好 → hot/warm（实际 ${p.verdict.level}）`);
  truthy(p.directions.go.length > 0, '有主线方向');
}

console.log('\n[21] 空池不抛错');
{
  const r = buildReview(mkState({ zt: [], zb: [], prevZt: [] }), 'closed');
  const p = r.tomorrowPlan;
  truthy(!!p, '空池也有 tomorrowPlan');
  truthy(Array.isArray(p.contingency) && p.contingency.length > 0, '空池仍有基础预案');
  truthy(Array.isArray(p.text) && p.text.length > 0, 'text 兼容字段非空');
}


console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
