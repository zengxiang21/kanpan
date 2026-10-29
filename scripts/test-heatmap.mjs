// 大盘云图单测：node scripts/test-heatmap.mjs
import { buildHeatmap } from '../server/src/heatmap.js';

let pass = 0, fail = 0;
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n        got  ${JSON.stringify(a)}\n        want ${JSON.stringify(b)}`); }
};
const ok = (c, label) => {
  if (c) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

// industryOf 依赖 industrymap.json，测试用它真实加载的映射不可控，
// 所以统一走 '其他' 之外的行业名前缀——这里直接断言结构性不变量，
// 不依赖具体映射结果。
const mkRow = (code, name, pct, amount = 1e8) => ({ code, name, pct, amount });
const mkZt = (code, name, lianban, industry, sealFund = 1e8, firstSeal = '09:31:00', zhaCount = 0) =>
  ({ code, name, lianban, industry, sealFund, firstSeal, zhaCount });

console.log('\n[1] 空/异常输入');
eq(buildHeatmap(null, null), null, 'sweep 为 null 返回 null');
eq(buildHeatmap({ rows: [] }, {}), null, 'rows 为空返回 null');
eq(buildHeatmap({ rows: [mkRow('000001', '甲', 1)] }, {}).groups.length, 1, '无涨停池也能出格子');

console.log('\n[2] limitUp 与 ztList 长度永远一致（核心不变量）');
{
  const r = buildHeatmap({
    rows: [mkRow('000001', '甲', 10), mkRow('000002', '乙', -5), mkRow('000003', '丙', 2)],
    advancers: 2, decliners: 1, flat: 0, updatedAt: 1,
  }, { zt: [mkZt('000001', '甲', 2, 'X')] });
  for (const g of r.groups) {
    eq(g.limitUp, g.ztList.length, `${g.industry}: limitUp === ztList.length`);
  }
}

console.log('\n[3] 有涨停池时 ztList 非空且字段完整');
{
  const r = buildHeatmap({
    rows: [mkRow('000001', '甲', 10)],
    advancers: 1, decliners: 0, flat: 0, updatedAt: 1,
  }, { zt: [mkZt('000001', '甲', 3, 'X', 2.5e8, '09:25:00', 1)] });
  const withZt = r.groups.filter((g) => g.ztList.length > 0);
  ok(withZt.length >= 1, '至少一个行业有涨停明细');
  const z = withZt[0].ztList[0];
  eq(z.code, '000001', 'ztList[0].code');
  eq(z.name, '甲', 'ztList[0].name');
  eq(z.lianban, 3, 'ztList[0].lianban');
  eq(z.sealFund, 2.5, 'ztList[0].sealFund 转亿元');
  eq(z.firstSeal, '09:25:00', 'ztList[0].firstSeal');
  eq(z.zhaCount, 1, 'ztList[0].zhaCount');
}

console.log('\n[4] ztList 按连板高度降序、同高度按封单降序');
{
  const r = buildHeatmap({
    rows: [mkRow('000001', '甲', 10), mkRow('000002', '乙', 10), mkRow('000003', '丙', 10)],
    advancers: 3, decliners: 0, flat: 0, updatedAt: 1,
  }, {
    zt: [
      mkZt('000001', '甲', 1, 'X', 1e8),
      mkZt('000002', '乙', 3, 'X', 5e7),
      mkZt('000003', '丙', 3, 'X', 9e7),
    ],
  });
  const g = r.groups.find((x) => x.ztList.length === 3);
  ok(!!g, '找到含 3 只涨停的行业');
  if (g) {
    eq(g.ztList.map((z) => z.code), ['000003', '000002', '000001'], '排序：3板大封单 → 3板小封单 → 1板');
  }
}

console.log('\n[5] 无涨停的行业 ztList 为空数组、limitUp 为 0');
{
  const r = buildHeatmap({
    rows: [mkRow('000001', '甲', -3)],
    advancers: 0, decliners: 1, flat: 0, updatedAt: 1,
  }, { zt: [] });
  const g = r.groups[0];
  eq(g.ztList, [], 'ztList 为空数组（不是 undefined）');
  eq(g.limitUp, 0, 'limitUp = 0');
  eq(g.hasZt, false, 'hasZt = false');
}

console.log('\n[6] "其他"兜底组也带 ztList 与一致口径');
{
  const r = buildHeatmap({
    rows: [mkRow('000001', '甲', -2)],
    advancers: 0, decliners: 1, flat: 0, updatedAt: 1,
  }, { zt: [] });
  const other = r.groups.find((g) => g.unmapped);
  if (other) {
    eq(other.limitUp, other.ztList.length, '其他: limitUp === ztList.length');
    eq(Array.isArray(other.ztList), true, '其他: ztList 是数组');
  } else {
    // 若所有票都映射到了具体行业，则没有"其他"组，也算通过
    pass++; console.log('  ok   无"其他"组（全部映射成功），跳过');
  }
}

console.log('\n[7] meta 完整性');
{
  const r = buildHeatmap({
    rows: [mkRow('000001', '甲', 10)],
    advancers: 1, decliners: 0, flat: 0, updatedAt: 123, amount: 1,
  }, { zt: [] });
  for (const k of ['total', 'advancers', 'decliners', 'flat', 'updatedAt', 'industries', 'mapped', 'unmapped', 'mapCoverage']) {
    ok(k in r.meta, `meta.${k} 存在`);
  }
  eq(r.meta.total, 1, 'meta.total = 行数');
  eq(r.meta.updatedAt, 123, 'meta.updatedAt 透传');
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
