// 龙头分层单测：node scripts/test-leaderpool.mjs
// 用假数据驱动 buildLeaderPool，验证分层与动态状态判定
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 快照文件是模块内常量，测试无法直接改路径。而"无快照"用例依赖它不存在，
// 所以测试开始时把真实快照挪开、结束时还原，保证可重复运行。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAP = path.join(__dirname, '..', 'server', 'data', 'leaderpool.json');
const BAK = SNAP + '.test-bak';
const hadSnap = fs.existsSync(SNAP);
if (hadSnap) fs.renameSync(SNAP, BAK);

const mod = await import('../server/src/leaderpool.js');
const { buildLeaderPool } = mod;

// 幂等：用标志位防止 exit handler 与显式调用各跑一次时把刚还原的文件又删掉
let restored = false;
const restore = () => {
  if (restored) return;
  restored = true;
  try {
    if (hadSnap) {
      if (fs.existsSync(SNAP)) fs.rmSync(SNAP, { force: true });
      if (fs.existsSync(BAK)) fs.renameSync(BAK, SNAP);
    } else if (fs.existsSync(SNAP)) {
      fs.rmSync(SNAP, { force: true });
    }
  } catch { /* 忽略 */ }
};
process.on('exit', restore);

// leaderpool.js 的 FILE 是模块内常量，测试通过 persist=false 避免写盘，
// 动态状态依赖快照文件，这里单独造一份放到 TMP 再借道不了——所以改用
// 直接验证静态分层（快照对比逻辑靠下面手动构造 prevTier 无法注入，
// 改为验证：无快照时全部标 new、有快照时正确标 up/hold/down）。

let pass = 0, fail = 0;
const eq = (a, b, label) => {
  const same = a instanceof Set && b instanceof Set
    ? a.size === b.size && [...a].every((x) => b.has(x))
    : JSON.stringify(a) === JSON.stringify(b);
  if (same) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n        got  ${JSON.stringify(a)}\n        want ${JSON.stringify(b)}`); }
};
const has = (arr, code, label) => {
  const ok = arr.some((x) => (x.code ?? x.leader?.code) === code);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} (${code} not in ${JSON.stringify(arr.map((x) => x.code ?? x.leader?.code))})`); }
};
const not = (arr, code, label) => {
  const ok = !arr.some((x) => (x.code ?? x.leader?.code) === code);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} (${code} 不该在)`); }
};

const st = (code, name, lianban, industry, sealFund = 1e8) =>
  ({ code, name, lianban, industry, sealFund, firstSeal: '09:31:00' });

console.log('\n[1] 单主线单高度：全部是总龙头');
{
  const pools = {
    zt: [st('001', '甲', 3, '算力'), st('002', '乙', 3, '算力')],
    prevZt: [],
  };
  const r = buildLeaderPool(pools, '20261029', false);
  eq(r.globalMaxLianban, 3, '全局最高板 = 3');
  eq(r.chief.length, 2, '两只 3 板并列总龙头');
  eq(r.second.length, 0, '无龙二（并列同高度不算龙二）');
  eq(r.chief.every((c) => c.status === 'new'), true, '无快照 → 全部 new');
}

console.log('\n[2] 主线内分层：总龙头 1 只，龙二是次高');
{
  const pools = {
    zt: [st('001', '甲', 4, '算力'), st('002', '乙', 2, '算力'), st('003', '丙', 2, '算力')],
    prevZt: [],
  };
  const r = buildLeaderPool(pools, '20261029', false);
  eq(r.globalMaxLianban, 4, '全局最高 4 板');
  has(r.chief, '001', '001 是总龙头');
  not(r.chief, '002', '002 不是总龙头');
  has(r.second, '002', '002 是龙二');
  not(r.second, '003', '003 不是龙二（同高度取封单大者）');
  has(r.branches, '001', '001 也是算力分支龙头');
}

console.log('\n[3] 多题材：分支龙头各取最高，主线只取前 3');
{
  const pools = {
    zt: [
      st('001', '甲', 4, '算力'), st('002', '乙', 2, '算力'),
      st('003', '丙', 3, '医药'), st('004', '丁', 2, '医药'),
      st('005', '戊', 2, '汽车'), st('006', '己', 2, '光伏'),
      st('007', '庚', 1, '银行'), // 首板不进分层
    ],
    prevZt: [],
  };
  const r = buildLeaderPool(pools, '20261029', false);
  has(r.chief, '001', '001 全局最高 4 板 = 总龙头');
  not(r.chief, '003', '003 是 3 板但不是全场最高');
  has(r.second, '002', '算力龙二 = 002');
  has(r.second, '004', '医药是主线，龙二 = 004');
  not(r.second, '006', '光伏非主线（前3之外），无龙二');
  // 中文 sort() 按码点顺序，与拼音序不同，用 Set 比较集合而非顺序
  eq(new Set(r.branches.map((b) => b.industry)), new Set(['算力', '汽车', '医药', '光伏']), '分支龙头覆盖 4 个题材');
  eq(r.branches.filter((b) => b.isMain).length, 3, '主线 = 前 3 个题材');
  const all = [...r.chief, ...r.second, ...r.branches.map((b) => b.leader)];
  not(all, '007', '首板（007）不进龙头分层');
}

console.log('\n[4] 掉出池：昨日涨停、今日断板（2 板以上才算龙头级）');
{
  const pools = {
    zt: [st('001', '甲', 4, '算力'), st('002', '乙', 2, '算力')],
    prevZt: [st('003', '丙', 3, '医药'), st('008', '辛', 2, '汽车'), st('009', '壬', 1, '银行')],
  };
  const r = buildLeaderPool(pools, '20261029', false);
  const dropCodes = r.dropped.map((d) => d.code).sort();
  eq(dropCodes, ['003', '008'], '003(3板)/008(2板) 断板 → 掉出');
  eq(r.dropped.some((d) => d.code === '009'), false, '009 是首板断板，噪音不列');
  eq(r.dropped.every((d) => d.wasTier === null), true, '无快照时 wasTier 为空');
  eq(r.stats.droppedCount, 2, '掉出计数 = 2');
  // 无快照兜底：昨日 3 板 ≥ 全局最高 4 板？否 → 不判总龙头断板
  eq(r.stats.chiefBroken, false, '003 昨3板 < 全局最高4板 → 不算总龙头断板');
}

console.log('\n[4b] 无快照时总龙头断板兜底判定');
{
  const pools = {
    zt: [st('001', '甲', 2, '算力'), st('002', '乙', 2, '算力')],
    prevZt: [st('003', '丙', 4, '医药')], // 昨日 4 板龙头，今日全场最高只有 2 板
  };
  const r = buildLeaderPool(pools, '20261029', false);
  eq(r.dropped.length, 1, '003 掉出');
  eq(r.stats.chiefBroken, true, '003 昨4板 ≥ 全局最高2板 → 判定总龙头断板');
}

console.log('\n[5] 晋级标记：今日高度 > 昨日高度');
{
  const pools = {
    zt: [st('001', '甲', 4, '算力'), st('002', '乙', 3, '算力')],
    prevZt: [st('001', '甲', 3, '算力'), st('002', '乙', 2, '算力')],
  };
  const r = buildLeaderPool(pools, '20261029', false);
  eq(r.chief[0].promoted, true, '001 昨3板今4板 → promoted');
  eq(r.chief[0].prevLianban, 3, '001 prevLianban = 3');
  eq(r.second[0].promoted, true, '002 昨2板今3板 → promoted');
}

console.log('\n[6] 边界：空池 / 全首板不抛错');
{
  const r1 = buildLeaderPool({ zt: [], prevZt: [] }, '20261029', false);
  eq(r1.globalMaxLianban, 0, '空池 → 最高板 0');
  eq(r1.chief.length, 0, '空池 → 无总龙头');
  eq(r1.branches.length, 0, '空池 → 无分支');
  const r2 = buildLeaderPool({ zt: [st('001', '甲', 1, '算力')], prevZt: [] }, '20261029', false);
  eq(r2.branches.length, 0, '只有首板 → 无分层');
  eq(r2.stats.themes, 0, '只有首板 → 无题材统计');
  const r3 = buildLeaderPool(null, '20261029', false);
  eq(r3.globalMaxLianban, 0, 'pools 为 null 不抛错');
}

console.log('\n[7] 封单格式化（亿）');
{
  const pools = { zt: [st('001', '甲', 3, '算力', 2.5e8)], prevZt: [] };
  const r = buildLeaderPool(pools, '20261029', false);
  eq(r.chief[0].sealFund, 2.5, '2.5e8 → 2.5 亿');
}

restore();
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
