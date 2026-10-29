// 异动监控单测：node scripts/test-anomaly.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// anomaly.js 的目录是模块内常量，测试无法改路径；先备份真实数据再跑，结束还原
const DIR = 'C:/Users/Administrator/.zcode/workspace/draft-ca856cf0-c06d-4726-b997-0898f0364349/server/data/anomaly';
const BAK = path.join(os.tmpdir(), 'anomaly-bak');
const existed = fs.existsSync(DIR);
if (existed) fs.cpSync(DIR, BAK, { recursive: true });

const restore = () => {
  try {
    if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true, force: true });
    if (fs.existsSync(BAK)) fs.cpSync(BAK, DIR, { recursive: true });
  } catch { /* 忽略 */ }
};
process.on('exit', restore);

const mod = await import('../server/src/anomaly.js');
const { detectAnomaly, todayEvents, anomalyDates, buildAnomalyReview } = mod;

let pass = 0, fail = 0;
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n        got  ${JSON.stringify(a)}\n        want ${JSON.stringify(b)}`); }
};
const truthy = (c, label) => {
  if (c) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

const row = (code, name, pct, price = 10) => ({ code, name, pct, price });
const pools = (zt = [], zb = []) => ({ zt, zb, dt: [], prevZt: [] });
const zt = (code, name, lianban, sealFund, pct = 10) => ({ code, name, lianban, sealFund, pct, firstSeal: '09:31:00', zhaCount: 0 });

console.log('\n[1] 空输入不抛错');
eq(detectAnomaly(null, null, false), [], 'rows 为 null 返回空');
eq(detectAnomaly([], null, false), [], 'rows 为空返回空');

console.log('\n[2] 首轮只建基线，不产事件');
{
  const r = detectAnomaly([row('001', 'A', 5, false)], pools());
  eq(r, [], '首轮无事件');
}

console.log('\n[3] 急拉/跳水：涨跌幅变化 >=1.5%');
{
  const mod2 = await import('../server/src/anomaly.js?u=1');
  mod2.detectAnomaly([row('001', 'A', 2, false)], pools());
  const r = mod2.detectAnomaly([row('001', 'A', 5, false)], pools());  // +3%
  const e = r.find((x) => x.type === '急拉' && x.code === '001');
  truthy(!!e, '检出急拉');
  if (e) { eq(e.delta, 3, 'delta = 3'); eq(e.from, 2, 'from = 2'); eq(e.to, 5, 'to = 5'); truthy(e.intervalMs != null, '带 intervalMs'); }
}

console.log('\n[4] 变化不足阈值不报');
{
  const m = await import('../server/src/anomaly.js?u=2');
  m.detectAnomaly([row('001', 'A', 5, false)], pools());
  const r = m.detectAnomaly([row('001', 'A', 6, false)], pools());  // +1%
  eq(r.filter((x) => x.type === '急拉').length, 0, '+1% 不报急拉');
}

console.log('\n[5] 触板 / 跌停：本轮新达到');
{
  const m = await import('../server/src/anomaly.js?u=3');
  m.detectAnomaly([row('001', 'A', 8, false), row('002', 'B', -8)], pools());
  const r = m.detectAnomaly([row('001', 'A', 10, false), row('002', 'B', -10)], pools());
  truthy(r.some((x) => x.type === '触板' && x.code === '001'), '001 触板');
  truthy(r.some((x) => x.type === '跌停' && x.code === '002'), '002 跌停');
}

console.log('\n[6] 已在板上不重复报触板');
{
  const m = await import('../server/src/anomaly.js?u=4');
  m.detectAnomaly([row('001', 'A', 10, false)], pools());
  const r = m.detectAnomaly([row('001', 'A', 10, false)], pools());
  eq(r.filter((x) => x.type === '触板').length, 0, '持续涨停不重复报');
}

console.log('\n[7] 炸板事件来自炸板池');
{
  const m = await import('../server/src/anomaly.js?u=5');
  m.detectAnomaly([row('001', 'A', 10, false)], pools());
  const r = m.detectAnomaly([row('001', 'A', 5, false)], pools([], [{ code: '001', name: 'A', pct: 5, price: 10, firstSeal: '09:31:00', zhaCount: 2 }]));
  const e = r.find((x) => x.type === '炸板');
  truthy(!!e, '检出炸板');
  if (e) { eq(e.zhaCount, 2, '带炸板次数'); eq(e.firstSeal, '09:31:00', '带首封时间'); }
}

console.log('\n[8] 封单骤减：缩水 >30% 且 >3000万');
{
  const m = await import('../server/src/anomaly.js?u=6');
  m.detectAnomaly([row('001', 'A', 10, false)], pools([zt('001', 'A', 2, 1e8)]));
  const r = m.detectAnomaly([row('001', 'A', 10, false)], pools([zt('001', 'A', 2, 5e7)]));  // 1亿→5000万
  const e = r.find((x) => x.type === '封单骤减');
  truthy(!!e, '检出封单骤减');
  if (e) { eq(e.sealBefore, 1, 'sealBefore = 1 亿'); eq(e.sealNow, 0.5, 'sealNow = 0.5 亿'); }
}

console.log('\n[9] 封单小幅波动不报');
{
  const m = await import('../server/src/anomaly.js?u=7');
  m.detectAnomaly([row('001', 'A', 10, false)], pools([zt('001', 'A', 2, 1e8)]));
  const r = m.detectAnomaly([row('001', 'A', 10, false)], pools([zt('001', 'A', 2, 9e7)]));  // 只缩 10%
  eq(r.filter((x) => x.type === '封单骤减').length, 0, '缩 10% 不报');
}

console.log('\n[10] 落盘 + 读取 + 日期列表');
{
  const m = await import('../server/src/anomaly.js?u=8');
  m.detectAnomaly([row('001', 'A', 2, false)], pools());
  m.detectAnomaly([row('001', 'A', 6, false)], pools());
  const evs = m.todayEvents();
  truthy(evs.length >= 1, 'todayEvents 有数据');
  const dates = m.anomalyDates();
  truthy(dates.length >= 1, 'anomalyDates 有今天');
  truthy(/^\d{8}$/.test(dates[0]), '日期格式 yyyyMMdd');
}

console.log('\n[11] 复盘聚合结构');
{
  const m = await import('../server/src/anomaly.js?u=9');
  m.detectAnomaly([row('001', 'A', 2, false), row('002', 'B', 3)], pools());
  m.detectAnomaly([row('001', 'A', 6, false), row('002', 'B', -2)], pools());
  const day = m.anomalyDates()[0];
  const r = m.buildAnomalyReview(day);
  for (const k of ['date', 'total', 'byType', 'byHour', 'topMovers', 'zhaTop', 'sealDrop', 'note']) {
    truthy(k in r, `review.${k} 存在`);
  }
  truthy(r.total > 0, 'total > 0');
  truthy(Array.isArray(r.byHour) && r.byHour.length > 0, 'byHour 非空');
  truthy(r.topMovers.every((x) => 'strong' in x), 'topMovers 带 strong 标记');
  // 同一只票只留最强一次
  const codes = r.topMovers.map((x) => x.code);
  eq(codes.length, new Set(codes).size, 'topMovers 无重复 code');
}

console.log('\n[12] 无记录日期复盘不抛错');
{
  const r = buildAnomalyReview('19990101');
  eq(r.total, 0, '空日期 total = 0');
  eq(r.topMovers, [], '空日期 topMovers 空');
  truthy(typeof r.note === 'string', '有空说明');
}

restore();
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
