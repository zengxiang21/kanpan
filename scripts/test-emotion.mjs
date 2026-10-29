// 情绪周期判定单测：node scripts/test-emotion.mjs
import { cycleStage, PLAYBOOK } from '../server/src/emotion.js';

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log(`  ok   ${label} => ${actual}`); }
  else { fail++; console.log(`  FAIL ${label} => got "${actual}", want "${expected}"`); }
}

const prem = (avg) => (avg == null ? null : { avg });
const zr = (n, d) => (d === 0 ? null : n / d);

console.log('\n[1] 退潮：跌停多于涨停且跌停>=10');
eq(cycleStage({ ztCount: 30, dtCount: 15, zhaRate: zr(5, 35), maxLianban: 2, premium: prem(0) }).stage, '启动', '跌停15<涨停30→不退潮(退潮要求跌停>涨停)');
eq(cycleStage({ ztCount: 8, dtCount: 20, zhaRate: zr(3, 11), maxLianban: 1, premium: prem(-2) }).stage, '退潮', '跌停20>涨停8');

console.log('\n[2] 冰点：涨停<20 且 溢价<1');
eq(cycleStage({ ztCount: 12, dtCount: 3, zhaRate: zr(2, 14), maxLianban: 1, premium: prem(0.4) }).stage, '冰点', '涨停12+溢价0.4');
eq(cycleStage({ ztCount: 12, dtCount: 3, zhaRate: zr(2, 14), maxLianban: 1, premium: prem(1.5) }).stage, '震荡', '涨停12但溢价1.5→非冰点');

console.log('\n[3] 分歧：涨停>=25 且 炸板率>=30% 且 最高板>=3');
eq(cycleStage({ ztCount: 39, dtCount: 0, zhaRate: zr(25, 64), maxLianban: 4, premium: prem(-0.8) }).stage, '分歧', '今日实况 39/39%/4板');
eq(cycleStage({ ztCount: 40, dtCount: 2, zhaRate: zr(5, 45), maxLianban: 4, premium: prem(1) }).stage, '启动', '炸板率仅11%→非分歧(发酵需涨停>=50，40只落启动)');
eq(cycleStage({ ztCount: 40, dtCount: 2, zhaRate: zr(20, 60), maxLianban: 2, premium: prem(1) }).stage, '启动', '炸板率高但最高板仅2→非分歧');
eq(cycleStage({ ztCount: 20, dtCount: 2, zhaRate: zr(12, 32), maxLianban: 3, premium: prem(0) }).stage, '震荡', '小市涨停20<25→不判分歧(P1-1修复)');

// TODO(阈值口径待确认)：40只涨停 + 4板高度 + 炸板率11%，现判"启动"而非"发酵"。
// 发酵门槛 ztCount>=50 是否过高？若你认为 40只+4板 已算发酵，把 emotion.js 里
// 发酵那条改成 `zt >= 40 && lb >= 3` 即可，本断言同步改。
eq(cycleStage({ ztCount: 40, dtCount: 2, zhaRate: zr(5, 45), maxLianban: 4, premium: prem(1) }).stage, '启动', '[待确认] 40只+4板+低炸板率→当前判启动');

console.log('\n[4] 高潮：涨停>=80 且 最高板>=4 且 炸板率<30%（P1-1修复：原版不可达）');
eq(cycleStage({ ztCount: 95, dtCount: 2, zhaRate: zr(15, 110), maxLianban: 5, premium: prem(2.5) }).stage, '高潮', '95只/5板/炸板率14%');
eq(cycleStage({ ztCount: 95, dtCount: 2, zhaRate: zr(15, 110), maxLianban: 3, premium: prem(2.5) }).stage, '发酵', '最高板仅3→非高潮');
eq(cycleStage({ ztCount: 95, dtCount: 2, zhaRate: zr(40, 135), maxLianban: 5, premium: prem(2.5) }).stage, '高潮', '炸板率29.6%<30%→高潮(分歧阈值边界)');
eq(cycleStage({ ztCount: 120, dtCount: 5, zhaRate: null, maxLianban: 6, premium: prem(3) }).stage, '高潮', '炸板率缺数据不阻断高潮');

console.log('\n[5] 发酵 / 启动 / 震荡');
eq(cycleStage({ ztCount: 60, dtCount: 3, zhaRate: zr(8, 68), maxLianban: 3, premium: prem(1.8) }).stage, '发酵', '60只/3板/炸板率12%');
eq(cycleStage({ ztCount: 35, dtCount: 2, zhaRate: zr(6, 41), maxLianban: 2, premium: prem(0.5) }).stage, '启动', '35只');
eq(cycleStage({ ztCount: 22, dtCount: 4, zhaRate: zr(5, 27), maxLianban: 2, premium: prem(0.5) }).stage, '震荡', '22只→震荡兜底');

console.log('\n[6] 每个阶段都有 desc 与 playbook，且 playbook 非空');
for (const s of ['冰点', '启动', '发酵', '高潮', '分歧', '退潮', '震荡']) {
  const ok = typeof PLAYBOOK[s] === 'string' && PLAYBOOK[s].length > 0;
  if (ok) { pass++; console.log(`  ok   ${s} playbook = "${PLAYBOOK[s]}"`); }
  else { fail++; console.log(`  FAIL ${s} playbook 缺失`); }
}

console.log('\n[7] 边界：空输入不抛错');
try {
  const r = cycleStage({});
  eq(r.stage, '震荡', '空对象→震荡');
  eq(typeof r.desc, 'string', 'desc 是字符串');
  eq(typeof r.playbook, 'string', 'playbook 是字符串');
} catch (e) { fail++; console.log('  FAIL 空输入抛错: ' + e.message); }

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
