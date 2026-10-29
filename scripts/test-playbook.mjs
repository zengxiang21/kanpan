// 开盘前操作手册单测：node scripts/test-playbook.mjs
import { buildPlaybook } from '../server/src/playbook.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// leaderpool 会读写快照文件，测试前备份、后还原
const DIR = 'C:/Users/Administrator/.zcode/workspace/draft-ca856cf0-c06d-4726-b997-0898f0364349/server/data';
const SNAP = path.join(DIR, 'leaderpool.json');
const BAK = path.join(os.tmpdir(), 'lp-bak.json');
const had = fs.existsSync(SNAP);
if (had) fs.copyFileSync(SNAP, BAK);
const restore = () => { try { if (had) fs.copyFileSync(BAK, SNAP); else if (fs.existsSync(SNAP)) fs.rmSync(SNAP); } catch {} };
process.on('exit', restore);

let pass = 0, fail = 0;
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n        got  ${JSON.stringify(a)}\n        want ${JSON.stringify(b)}`); }
};
const truthy = (c, label) => {
  if (c) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

const zt = (code, name, lianban, industry, sealFund = 1e8, floatCap = 1e10, firstSeal = '09:31:00') =>
  ({ code, name, lianban, industry, sealFund, floatCap, firstSeal, zhaCount: 0 });
const mkState = (pools, tickExtra = {}) => ({
  tradingDay: '20261029',
  tick: { ztCount: pools.zt.length, dtCount: 0, zbCount: 0, zhaRate: 0, maxLianban: 0, lianbanDist: {}, indices: [], env: { total: 50, label: '轻仓试错', advice: 'x', parts: [] }, amount2m: 1e12, advancers: 2000, decliners: 1000, flat: 0, cycleStage: '发酵', ...tickExtra },
  pools, marketSweep: null, sentiment: null, sectors: null,
});
const auction = (rows, dirs, mode = 'auction') => ({ mode, rows, directions: dirs, note: '' });

console.log('\n[1] 基本结构与一页结论');
{
  const s = mkState({ zt: [zt('001', 'KA', 4, 'X', 3e8)], zb: [], prevZt: [] });
  const pb = buildPlaybook(s, auction([{ code: '001', name: 'KA', gap: 6, lianban: 4, direction: 'X' }], [{ direction: 'X', count: 5, strength: 220, avgGap: 4.5, top: 'KA' }]));
  for (const k of ['tradingDay', 'mode', 'isLive', 'env', 'oneLiner', 'scenes', 'directionTable', 'leaders', 'yesterdayPlan']) {
    truthy(k in pb, `playbook.${k} 存在`);
  }
  eq(pb.isLive, true, 'auction 模式 → isLive');
  truthy(typeof pb.oneLiner === 'string' && pb.oneLiner.length > 10, 'oneLiner 非空');
}

console.log('\n[2] 场景 A：龙头高开 6% → 强一致');
{
  const s = mkState({ zt: [zt('001', 'KA', 4, 'X', 3e8)], zb: [], prevZt: [] }, { env: { total: 80, label: '重仓出击', advice: 'x', parts: [] }, cycleStage: '发酵' });
  const pb = buildPlaybook(s, auction([{ code: '001', name: 'KA', gap: 6, lianban: 4, direction: 'X' }], [{ direction: 'X', count: 5, strength: 220, avgGap: 4.5, top: 'KA' }]));
  const a = pb.scenes.find((x) => x.key === 'chief');
  truthy(!!a, '有场景 A');
  if (a) {
    eq(a.level, 'go', '高开 6% + 环境好 → go');
    truthy(a.action.includes('竞价') || a.action.includes('参与'), '动作含竞价参与');
    truthy(a.detail.includes('6'), 'detail 含高开幅度');
  }
}

console.log('\n[3] 场景 A：龙头一字板 → 买不进');
{
  const s = mkState({ zt: [zt('001', 'KA', 4, 'X', 3e8)], zb: [], prevZt: [] });
  const pb = buildPlaybook(s, auction([{ code: '001', name: 'KA', gap: 9.5, lianban: 4, direction: 'X' }], [{ direction: 'X', count: 5, strength: 220, avgGap: 4.5, top: 'KA' }]));
  const a = pb.scenes.find((x) => x.key === 'chief');
  eq(a.level, 'warn', '一字 → warn');
  truthy(a.action.includes('买不进'), '动作=买不进');
}

console.log('\n[4] 场景 B：一字板 → 同板块套利候选');
{
  const s = mkState({ zt: [zt('001', 'KA', 4, 'X', 3e8), zt('002', 'KB', 1, 'X', 5e7), zt('003', 'KC', 2, 'X', 8e7)], zb: [], prevZt: [] });
  const rows = [
    { code: '001', name: 'KA', gap: 9.5, lianban: 4, direction: 'X' },
    { code: '002', name: 'KB', gap: 3, lianban: 1, direction: 'X' },
    { code: '003', name: 'KC', gap: 4, lianban: 2, direction: 'X' },
  ];
  const pb = buildPlaybook(s, auction(rows, [{ direction: 'X', count: 5, strength: 220, avgGap: 4.5, top: 'KA' }]));
  const b = pb.scenes.find((x) => x.key === 'arb');
  truthy(!!b, '有场景 B');
  if (b) {
    truthy(b.stocks.length >= 1, '给出套利候选');
    truthy(b.detail.includes('一字'), 'detail 说明一字板买不进');
    truthy(b.stocks.every((x) => x.code !== '001'), '候选不含一字板本身');
  }
}

console.log('\n[5] 场景 C：环境好 → 做多主线');
{
  const s = mkState({ zt: [zt('001', 'KA', 4, 'X', 3e8)], zb: [], prevZt: [] }, { env: { total: 80, label: '重仓出击', advice: 'x', parts: [] }, cycleStage: '发酵' });
  const pb = buildPlaybook(s, auction([{ code: '001', name: 'KA', gap: 6, lianban: 4, direction: 'X' }], [{ direction: 'X', count: 5, strength: 220, avgGap: 4.5, top: 'KA' }]));
  truthy(pb.scenes.some((x) => x.key === 'good'), '有场景 C');
  eq(pb.env.level, 'hot', '环境档位 hot');
}

console.log('\n[6] 场景 D：龙头断板 → 空仓');
{
  const s = mkState({
    zt: [zt('001', 'LOW', 3, 'X', 1e8)],
    zb: [],
    prevZt: [zt('009', 'TOP', 5, 'X', 1e8)],
  }, { cycleStage: '退潮' });
  const pb = buildPlaybook(s, auction([{ code: '001', name: 'LOW', gap: 1, lianban: 3, direction: 'X' }], [{ direction: 'X', count: 3, strength: 100, avgGap: 1.5, top: 'LOW' }]));
  eq(pb.env.level, 'freeze', '高度真空 → freeze');
  const d = pb.scenes.find((x) => x.key === 'bad');
  truthy(!!d, '有场景 D');
  if (d) truthy(d.action.includes('空仓'), '动作=空仓');
  truthy(pb.oneLiner.includes('空仓'), 'oneLiner 提及空仓');
}

console.log('\n[7] 方向速查表：主线延续 vs 新方向');
{
  const s = mkState({ zt: [zt('001', 'KA', 4, 'X', 3e8), zt('002', 'KB', 1, 'Y', 5e7)], zb: [], prevZt: [] });
  const dirs = [
    { direction: 'X', count: 5, strength: 220, avgGap: 4.5, top: 'KA' },
    { direction: 'Y', count: 3, strength: 150, avgGap: 2.5, top: 'KB' },
  ];
  const pb = buildPlaybook(s, auction([], dirs));
  truthy(pb.directionTable.length === 2, '两个方向');
  const rels = pb.directionTable.map((d) => d.relation);
  truthy(rels.includes('主线延续') || rels.includes('新方向'), '有延续/新方向标注');
}

console.log('\n[8] 预演模式 isLive=false');
{
  const s = mkState({ zt: [zt('001', 'KA', 4, 'X', 3e8)], zb: [], prevZt: [] });
  const pb = buildPlaybook(s, auction([], [], 'preview'));
  eq(pb.isLive, false, 'preview → isLive false');
  eq(pb.mode, 'preview', 'mode=preview');
}

console.log('\n[9] 空数据不抛错');
{
  const s = mkState({ zt: [], zb: [], prevZt: [] });
  const pb = buildPlaybook(s, auction([], []));
  truthy(!!pb, '空数据仍有 playbook');
  truthy(Array.isArray(pb.scenes), 'scenes 是数组');
  truthy(Array.isArray(pb.directionTable), 'directionTable 是数组');
}

restore();
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
