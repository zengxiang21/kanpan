// 两融 / 爆仓风险 / 美债百分位 测试
//
// 覆盖三类：
//   1) 纯函数：百分位计算、日期规范化、偿还比推导（离线，不联网）
//   2) 数据契约：margin.js / treasury.js 的关键实现要点（防回归）
//   3) 线上接口：/api/margin、/api/liquidation、/api/treasury（需服务在跑）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// ---------- 纯函数：百分位 ----------
function pctOf(values, v) {
  if (!values.length || v == null) return null;
  let below = 0;
  for (const x of values) if (x < v) below++;
  return +((below / values.length) * 100).toFixed(1);
}

console.log('[1] 百分位计算');
{
  ok(pctOf([1, 2, 3, 4, 5], 3) === 40, '中位数处应为 40%，实际 ' + pctOf([1, 2, 3, 4, 5], 3));
  ok(pctOf([1, 2, 3], 1) === 0, '最小值应为 0%，实际 ' + pctOf([1, 2, 3], 1));
  ok(pctOf([1, 2, 3], 3) === 66.7, '最大值应为 66.7%，实际 ' + pctOf([1, 2, 3], 3));
  ok(pctOf([], 5) === null, '空序列返回 null');
  ok(pctOf([1, 2], null) === null, 'value 为 null 返回 null');
  ok(pctOf([5, 5, 5], 5) === 0, '全同值时百分位为 0');
}

// ---------- 纯函数：日期规范化（曾经的 bug） ----------
console.log('[2] 日期规范化 YYYYMMDD → YYYY-MM-DD');
{
  function normDate(v) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return null;
  }
  ok(normDate('20261030') === '2026-10-30', 'state.tradingDay 的 YYYYMMDD 格式');
  ok(normDate('2026-10-30') === '2026-10-30', '已是带横杠格式不变');
  ok(normDate('2026-10-30 12:00:00') === '2026-10-30', '带时间的截断到日期');
  ok(normDate('') === null, '空串返回 null');
  ok(normDate(null) === null, 'null 返回 null');
  ok(normDate('abc') === null, '非日期串返回 null');
  // 关键回归：未规范化的 '20261030' 构造 Date 是 Invalid，导致回退逻辑整体失效
  ok(Number.isNaN(new Date('20261030T00:00:00Z').getTime()), '证实 20261030 直接构造 Date 是 Invalid（原 bug 根因）');
  ok(!Number.isNaN(new Date('2026-10-30T00:00:00Z').getTime()), '规范化后可正常构造 Date');
}

// ---------- 纯函数：偿还比与强平分级 ----------
console.log('[3] 偿还比与强平压力分级');
{
  const ratio = (che, mre) => (mre > 0 ? +(che / mre).toFixed(2) : null);
  ok(ratio(150, 100) === 1.5, '偿还150/买入100 = 1.5');
  ok(ratio(100, 100) === 1, '偿还=买入 = 1');
  ok(ratio(50, 100) === 0.5, '偿还<买入 = 0.5');
  ok(ratio(100, 0) === null, '买入为 0 时返回 null（不产出 Infinity）');

  const HIGH = 5;
  const pressure = (heavy, pct) => {
    if (pct == null) return 'low';
    if (heavy && pct <= -7) return 'critical';
    if (heavy && pct <= -3) return 'high';
    if (pct <= -7) return 'watch';
    return 'low';
  };
  ok(pressure(true, -8) === 'critical', '高杠杆+跌8% = critical');
  ok(pressure(true, -4) === 'high', '高杠杆+跌4% = high');
  ok(pressure(false, -8) === 'watch', '非高杠杆+跌8% = watch');
  ok(pressure(true, 2) === 'low', '高杠杆但上涨 = low');
  ok(pressure(true, null) === 'low', '无行情 = low（不误报）');
  ok((8.6 >= HIGH) === true, '占流通比 8.6% 判定为高杠杆');
  ok((1.73 >= HIGH) === false, '占流通比 1.73% 不是高杠杆');
}

// ---------- 数据契约：源码要点 ----------
console.log('[4] margin.js / treasury.js 实现要点');
{
  const margin = fs.readFileSync(path.join(ROOT, 'server/src/margin.js'), 'utf8');
  const tsy = fs.readFileSync(path.join(ROOT, 'server/src/treasury.js'), 'utf8');

  ok(margin.includes('function normDate'), 'margin.js 有日期规范化（原 bug 修复点）');
  ok(margin.includes('RPTA_RZRQ_LSHJ'), '用东财两融汇总报表');
  ok(margin.includes('RPTA_WEB_RZRQ_GGMX'), '用东财两融个股明细报表');
  ok(margin.includes('repayRatio'), '个股行含偿还比字段');
  ok(/for \(let back = 0; back < 5; back\+\+\)/.test(margin), '有 T+1 日期回退（最多 5 天）');
  ok(/HIGH_LEVERAGE_PCT = 5/.test(margin), '高杠杆阈值 5%');
  ok(/MARGIN_CALL_RATIO = 130/.test(margin), '平仓线经验值 130');
  ok(margin.includes('quoteSource'), '输出行情来源，便于判断因子2 是否可信');

  ok(tsy.includes('fredgraph.csv'), '用 FRED 公开 CSV 端点');
  // 注释里会提到 api.stlouisfed.org（作为「需 key 所以没用它」的调研记录），
  // 不能断言源码不含该字符串，只能断言真实请求不指向它
  ok(!/fetch\([^)]*api\.stlouisfed\.org/.test(tsy), '不对需 key 的 api 端点发请求');
  ok(tsy.includes('DGS10') && tsy.includes('DGS2'), '覆盖 10Y 与 2Y');
  ok(tsy.includes('pct1y') && tsy.includes('pct3y') && tsy.includes('pct10y'), '输出多周期百分位（1Y/3Y/10Y）');
  ok(tsy.includes('pctAll'), '也有全历史百分位');
  ok(tsy.includes('spread'), '计算期限利差');
  ok(tsy.includes("v === '.'"), '跳过 FRED 的缺失值标记');
}

console.log('[5] macro.js 关于 FRED 的错误结论已修正');
{
  const macro = fs.readFileSync(path.join(ROOT, 'server/src/macro.js'), 'utf8');
  ok(macro.includes('fredgraph.csv'), '注释已说明 fredgraph.csv 公开可用');
  ok(macro.includes('server/src/treasury.js'), '注释已指向 treasury.js');
}

// ---------- 线上接口 ----------
console.log('[6] 线上接口（需服务在跑）');
{
  const B = 'http://127.0.0.1:8000';
  try {
    const m = await (await fetch(B + '/api/margin')).json();
    ok(m.balanceWanYi > 0 && m.ratio > 0, '两融汇总：' + m.balanceWanYi + '万亿 水位' + m.ratio + '%');
    ok(m.pctAll != null && m.samples > 100, '百分位 ' + m.pctAll + '% 基于 ' + m.samples + ' 日');
    ok(m.chg5d != null && m.negStreak >= 0, '5日变化 ' + m.chg5d + '% 连续净流出 ' + m.negStreak + ' 日');
    ok(Array.isArray(m.trend) && m.trend.length > 10, '趋势 ' + m.trend.length + ' 点');
  } catch (e) { ok(false, 'margin 接口: ' + e.message); }

  try {
    const l = await (await fetch(B + '/api/liquidation')).json();
    ok(typeof l.score === 'number' && l.level, '评分 ' + l.score + ' ' + (l.level && l.level.label));
    ok(l.factors && l.factors.leveragePct != null, '因子1 杠杆百分位有值');
    ok(l.factors && (l.factors.heavyAvgRepayRatio != null || l.factors.heavyAvgPct != null), '因子2 有值（偿还比或跌幅）');
    ok(l.factors && l.factors.balanceChg5d != null, '因子3 去杠杆速度有值');
    ok(Array.isArray(l.impacts) && l.impacts.length > 0, '影响 ' + (l.impacts || []).length + ' 条');
    ok(Array.isArray(l.heavyStocks) && l.heavyStocks.length > 0, '危险股 ' + (l.heavyStocks || []).length + ' 只');
    ok(/^\d{4}-\d{2}-\d{2}$/.test(l.marginDate || ''), 'marginDate 已规范化为 ' + l.marginDate);
    const h = (l.heavyStocks || [])[0];
    ok(h && h.repayRatio != null, '首只 ' + (h && h.name) + ' 偿还比 ' + (h && h.repayRatio));
  } catch (e) { ok(false, 'liquidation 接口: ' + e.message); }

  try {
    const t = await (await fetch(B + '/api/treasury')).json();
    const y10 = (t.rows || []).find((r) => r.id === 'DGS10');
    ok(y10 && y10.value > 0, '美债10Y ' + (y10 && y10.value) + '% (' + (y10 && y10.date) + ')');
    ok(y10 && y10.pct1y != null && y10.pct10y != null, '多周期百分位 1Y=' + (y10 && y10.pct1y) + '% 10Y=' + (y10 && y10.pct10y) + '%');
    ok(y10 && Array.isArray(y10.trend) && y10.trend.length > 10, '趋势 ' + (y10 && y10.trend && y10.trend.length) + ' 点');
    ok(t.spread && typeof t.spread.value === 'number', '期限利差 ' + (t.spread && t.spread.value) + ' ' + (t.spread && t.spread.label));
    ok((t.rows || []).length >= 3, '覆盖 ' + (t.rows || []).length + ' 个期限');
  } catch (e) { ok(false, 'treasury 接口: ' + e.message); }

  try {
    const r = await fetch(B + '/api/treasury?limit=abc');
    ok(r.ok, 'treasury 非法 limit 不报错（回落默认值）');
  } catch (e) { ok(false, 'treasury 非法 limit: ' + e.message); }
}

console.log('');
console.log('===== ' + pass + ' passed, ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
