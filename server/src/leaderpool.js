// 龙头分层动态池（E4）
//
// 把"谁是真龙头"从静态排名变成动态分层：
//   总龙头   全场最高连板高度（可并列）
//   龙二     主线题材内第二高度
//   分支龙头 各活跃题材内的最高板
//
// "动态"体现在与上一交易日快照对比，给每只票标状态：
//   new  新进池（昨日不在该层）
//   up   层级上升（如 分支龙头 → 龙二 → 总龙头）
//   hold 保持
//   down 层级下降
//   drop 昨日在本层、今天断板或跌出（单列在 dropped 里，用来判断龙头是否断板）
//
// 数据源只用涨停池（实时，不依赖本地历史库），所以历史库没下完也能用。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'leaderpool.json');

const TIER_RANK = { chief: 3, second: 2, branch: 1 };

function loadPrev() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return null;
  }
}

function save(day, snapshot) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ date: day, at: Date.now(), snapshot }));
    fs.renameSync(tmp, FILE);
  } catch { /* 落盘失败不影响结果 */ }
}

function fmtSeal(v) {
  return v ? +(v / 1e8).toFixed(2) : 0;
}

/**
 * @param {object} pools  state.pools（zt / zb / dt / prevZt）
 * @param {string} day    交易日 yyyyMMdd
 * @param {boolean} persist 是否落盘快照（云端模式/只读场景传 false）
 */
export function buildLeaderPool(pools, day, persist = true) {
  const zt = pools?.zt || [];
  const prevZt = pools?.prevZt || [];
  const prevMap = new Map(prevZt.map((z) => [z.code, z.lianban || 1]));

  // 昨日断板（在昨日池、今日不在涨停池）
  const todaySet = new Set(zt.map((z) => z.code));
  const brokenToday = prevZt.filter((z) => !todaySet.has(z.code));

  // ---- 按题材分组（只留有连板高度的，首板不参与龙头分层）----
  const byIndustry = new Map();
  for (const z of zt) {
    const lb = z.lianban || 1;
    if (lb < 2) continue;
    const ind = z.industry || '其他';
    let g = byIndustry.get(ind);
    if (!g) { g = { industry: ind, stocks: [] }; byIndustry.set(ind, g); }
    g.stocks.push(z);
  }

  const themes = [...byIndustry.values()]
    .map((g) => {
      const st = g.stocks.sort((a, b) => (b.lianban || 1) - (a.lianban || 1) || (b.sealFund || 0) - (a.sealFund || 0));
      return {
        industry: g.industry,
        count: g.stocks.length,
        maxLianban: st[0].lianban || 1,
        sealFund: st.reduce((s, x) => s + (x.sealFund || 0), 0),
        stocks: st,
      };
    })
    .sort((a, b) => b.maxLianban - a.maxLianban || b.count - a.count || b.sealFund - a.sealFund);

  // 主线 = 最高板最高 + 家数最多的前 3 个题材
  const mainThemes = themes.slice(0, 3);

  const globalMax = themes.length ? themes[0].maxLianban : 0;

  // ---- 分层 ----
  const chief = [];   // 全场最高板
  const second = [];  // 主线内第二高度
  const branches = [];// 各题材最高板

  for (const t of themes) {
    const top = t.stocks[0];
    branches.push({
      industry: t.industry,
      isMain: mainThemes.includes(t),
      count: t.count,
      maxLianban: t.maxLianban,
      leader: { code: top.code, name: top.name, lianban: top.lianban || 1, sealFund: fmtSeal(top.sealFund) },
      second: t.stocks[1]
        ? { code: t.stocks[1].code, name: t.stocks[1].name, lianban: t.stocks[1].lianban || 1, sealFund: fmtSeal(t.stocks[1].sealFund) }
        : null,
    });
    // 主线内第二高度 → 龙二（必须是"次高"：与龙头同高度的并列龙头不算龙二）
    if (mainThemes.includes(t) && t.stocks[1] && (t.stocks[1].lianban || 1) < t.maxLianban) {
      second.push(t.stocks[1]);
    }
  }

  for (const t of themes) {
    if (t.maxLianban !== globalMax) continue;
    for (const s of t.stocks) {
      if ((s.lianban || 1) !== globalMax) continue;
      chief.push(s);
    }
  }

  const decorate = (s) => ({
    code: s.code, name: s.name, lianban: s.lianban || 1,
    industry: s.industry || '其他',
    sealFund: fmtSeal(s.sealFund), firstSeal: s.firstSeal || null,
    prevLianban: prevMap.get(s.code) || null,
    promoted: (prevMap.get(s.code) || 0) > 0 && (s.lianban || 1) > prevMap.get(s.code),
  });

  const chiefOut = chief.map(decorate);
  const secondOut = second.map(decorate);
  const branchOut = branches.map((b) => ({ ...b }));

  // ---- 与上一交易日快照对比，标动态状态 ----
  const prev = loadPrev();
  const prevTier = new Map(); // code -> tier
  if (prev?.snapshot) {
    for (const s of prev.snapshot.chief || []) prevTier.set(s.code, 'chief');
    for (const s of prev.snapshot.second || []) prevTier.set(s.code, 'second');
    for (const b of prev.snapshot.branches || []) {
      if (b.leader) prevTier.set(b.leader.code, 'branch');
    }
  }

  const markStatus = (arr, tier) => {
    for (const s of arr) {
      const p = prevTier.get(s.code);
      if (!p) s.status = 'new';
      else if (TIER_RANK[tier] > TIER_RANK[p]) s.status = 'up';
      else if (TIER_RANK[tier] === TIER_RANK[p]) s.status = 'hold';
      else s.status = 'down';
    }
  };
  markStatus(chiefOut, 'chief');
  markStatus(secondOut, 'second');
  for (const b of branchOut) {
    if (!b.leader) continue;
    const p = prevTier.get(b.leader.code);
    b.leader.status = !p ? 'new' : p === 'branch' ? 'hold' : 'up';
  }

  // 掉出池：昨日涨停、今日断板。
  // 注意：不能只用"昨日在本层"来过滤——没有历史快照时（首次运行）那样会全被滤掉，
  // 而"龙头断板"恰恰是最重要的退潮先行信号。所以：
  //   有快照 → 用昨日层级标 wasTier（能区分是从总龙头还是分支龙头掉出）
  //   无快照 → 也照样列出，wasTier 标 null，靠昨日连板高度本身判断重要性
  const dropped = brokenToday
    .map((z) => ({
      code: z.code, name: z.name, lianban: z.lianban || 1,
      industry: z.industry || '其他',
      wasTier: prevTier.get(z.code) || null,
      sealFund: fmtSeal(z.sealFund),
    }))
    // 昨日 2 板以上的才算"龙头级"断板；首板断板噪音大，不列
    .filter((d) => d.lianban >= 2)
    .sort((a, b) => b.lianban - a.lianban);

  const snapshot = { chief: chiefOut, second: secondOut, branches: branchOut };
  if (persist) save(day, snapshot);

  return {
    date: day,
    generatedAt: Date.now(),
    prevDate: prev?.date || null,
    globalMaxLianban: globalMax,
    chief: chiefOut,
    second: secondOut,
    branches: branchOut,
    dropped,
    stats: {
      themes: themes.length,
      mainThemes: mainThemes.map((t) => t.industry),
      chiefCount: chiefOut.length,
      secondCount: secondOut.length,
      droppedCount: dropped.length,
      hasPrev: !!prev,
      // 龙头断板是退潮信号：总龙头掉出池要警惕。
      // 有快照看 wasTier；无快照时用"昨日高度 ≥ 全局最高板"兜底判断
      chiefBroken: dropped.some((d) => d.wasTier === 'chief' || (!prev && d.lianban >= globalMax)),
    },
  };
}
