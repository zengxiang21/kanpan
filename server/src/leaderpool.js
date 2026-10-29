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
// 除分层外还算"龙头质量分"：光洋股份和青岛食品都是 4 板，但前者封单只有 0.09 亿
// （几乎要开板）、后者 1.65 亿（强封），强弱差 18 倍。只看连板高度会把两者并列，
// 实战中会接错票。质量分综合 高度/封流比/封板时间/题材地位/梯队支撑 五个维度。
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

// 封板时间 → 分数（早封=主动性强，尾盘=资金犹豫）
function sealTimeScore(firstSeal) {
  if (!firstSeal) return 6;              // 无时间数据给中性
  const [h, m] = firstSeal.split(':').map(Number);
  const mins = h * 60 + m;
  if (mins <= 9 * 60 + 35) return 15;    // 09:35 前（含竞价一字）
  if (mins <= 10 * 60) return 12;        // 10:00 前
  if (mins <= 14 * 60) return 8;         // 14:00 前
  return 4;                              // 尾盘
}

/**
 * 龙头质量分（0-100）
 * @param {object} s      涨停池条目
 * @param {object} ctx    { isMain, themeCount, hasFollower }
 * @returns {{score:number, breakdown:Array}}
 */
function qualityOf(s, ctx) {
  const lb = s.lianban || 1;
  const seal = s.sealFund || 0;
  const cap = s.floatCap || 0;

  // 1) 连板高度 40 分
  let hScore;
  if (lb >= 6) hScore = 40;
  else if (lb === 5) hScore = 36;
  else if (lb === 4) hScore = 32;
  else if (lb === 3) hScore = 24;
  else if (lb === 2) hScore = 14;
  else hScore = 6;

  // 2) 封流比 25 分（封单/流通市值，>2% 属强封）
  const sealRatio = cap > 0 ? seal / cap : null;
  let sScore;
  if (sealRatio == null) sScore = 12;                    // 无市值数据给中性
  else if (sealRatio >= 0.05) sScore = 25;
  else if (sealRatio >= 0.02) sScore = 21;
  else if (sealRatio >= 0.01) sScore = 15;
  else if (sealRatio >= 0.005) sScore = 9;
  else sScore = 3;                                        // 封流比 <0.5% 极弱

  // 3) 封板时间 15 分
  const tScore = sealTimeScore(s.firstSeal);

  // 4) 题材地位 12 分
  const mScore = ctx.isMain ? 12 : 5;

  // 5) 梯队支撑 8 分（同题材有跟风=不是孤军）
  const fScore = ctx.hasFollower ? 8 : 0;

  const total = hScore + sScore + tScore + mScore + fScore;
  return {
    score: Math.min(100, total),
    breakdown: [
      { name: '高度', score: hScore, max: 40, note: `${lb} 板` },
      { name: '封流比', score: sScore, max: 25, note: sealRatio == null ? '无市值数据' : `${(sealRatio * 100).toFixed(2)}%` },
      { name: '封板时间', score: tScore, max: 15, note: s.firstSeal || '-' },
      { name: '题材地位', score: mScore, max: 12, note: ctx.isMain ? '主线' : '分支' },
      { name: '梯队支撑', score: fScore, max: 8, note: ctx.hasFollower ? '有跟风' : '孤军' },
    ],
  };
}

// 次日预期：基于质量分 + 梯队 + 断板情况给可执行结论
function nextDayHint(s, q, ctx) {
  const lb = s.lianban || 1;
  if (ctx.chiefBroken) return { level: 'avoid', text: '总龙头已断板，高度下降，次日不接力，等新周期' };
  if (q.score >= 75 && ctx.isMain && ctx.hasFollower) return { level: 'chase', text: '质量高+主线+有跟风：竞价高开可接力，量比<3 视为无效' };
  if (q.score >= 60) return { level: 'low', text: '质量中上：只做缩量回踩低吸，不追盘中急拉' };
  if (!ctx.hasFollower) return { level: 'care', text: '孤军作战无跟风：难持续，轻仓或观望' };
  if (lb >= 4) return { level: 'care', text: '高位板：只做弱转强确认，否则观望' };
  return { level: 'low', text: '质量一般：等回踩企稳再考虑，不打板' };
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
      // 梯队深度：该题材覆盖了几个不同高度（4板+2板 = 深度2）
      const heights = [...new Set(st.map((s) => s.lianban || 1))].sort((a, b) => b - a);
      // 断层：有高度 N 但缺 N-1（如只有 4 板和 2 板、缺 3 板）
      const gaps = [];
      for (let i = 0; i < heights.length - 1; i++) {
        if (heights[i] - heights[i + 1] > 1) gaps.push(`${heights[i + 1] + 1}板`);
      }
      return {
        industry: g.industry,
        count: g.stocks.length,
        maxLianban: st[0].lianban || 1,
        sealFund: st.reduce((s, x) => s + (x.sealFund || 0), 0),
        stocks: st,
        heights,
        depth: heights.length,
        gaps,
      };
    })
    .sort((a, b) => b.maxLianban - a.maxLianban || b.depth - a.depth || b.count - a.count || b.sealFund - a.sealFund);

  // 主线 = 最高板最高 + 梯队最深 + 家数最多的前 3 个题材
  const mainThemes = themes.slice(0, 3);
  const mainSet = new Set(mainThemes.map((t) => t.industry));

  const globalMax = themes.length ? themes[0].maxLianban : 0;

  // ---- 分层 ----
  const chief = [];   // 全场最高板
  const second = [];  // 主线内第二高度
  const branches = [];// 各题材最高板

  for (const t of themes) {
    const top = t.stocks[0];
    const hasFollower = t.stocks.length > 1;
    const ctx = { isMain: mainSet.has(t.industry), hasFollower, themeCount: t.count };
    branches.push({
      industry: t.industry,
      isMain: ctx.isMain,
      count: t.count,
      maxLianban: t.maxLianban,
      depth: t.depth,
      heights: t.heights,
      gaps: t.gaps,
      stocks: t.stocks.map((s) => ({
        code: s.code, name: s.name, lianban: s.lianban || 1, sealFund: fmtSeal(s.sealFund),
      })),
      leader: { code: top.code, name: top.name, lianban: top.lianban || 1, sealFund: fmtSeal(top.sealFund) },
      second: t.stocks[1]
        ? { code: t.stocks[1].code, name: t.stocks[1].name, lianban: t.stocks[1].lianban || 1, sealFund: fmtSeal(t.stocks[1].sealFund) }
        : null,
    });
    // 主线内第二高度 → 龙二（必须是"次高"：与龙头同高度的并列龙头不算龙二）
    if (ctx.isMain && t.stocks[1] && (t.stocks[1].lianban || 1) < t.maxLianban) {
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

  // 昨日最高板（用于判断"高度是否下降"——退潮的核心信号）
  const prevMax = prevZt.reduce((m, z) => Math.max(m, z.lianban || 1), 0);
  // 总龙头是否断板：昨日最高板高度 > 今日最高板高度，且昨日那只今天没连上
  const chiefBroken = prevMax > globalMax && prevZt.some((z) => (z.lianban || 1) === prevMax && !todaySet.has(z.code));

  // 质量分上下文：需要知道每只票所属题材是否主线、有无跟风
  const themeCtx = new Map();
  for (const t of themes) {
    themeCtx.set(t.industry, {
      isMain: mainSet.has(t.industry),
      hasFollower: t.stocks.length > 1,
    });
  }

  const decorate = (s) => {
    const tc = themeCtx.get(s.industry) || { isMain: false, hasFollower: false };
    const q = qualityOf(s, tc);
    return {
      code: s.code, name: s.name, lianban: s.lianban || 1,
      industry: s.industry || '其他',
      sealFund: fmtSeal(s.sealFund), firstSeal: s.firstSeal || null,
      sealRatio: s.floatCap > 0 && s.sealFund ? +((s.sealFund / s.floatCap) * 100).toFixed(2) : null,
      zhaCount: s.zhaCount || 0,
      prevLianban: prevMap.get(s.code) || null,
      promoted: (prevMap.get(s.code) || 0) > 0 && (s.lianban || 1) > prevMap.get(s.code),
      quality: q.score,
      qualityBreakdown: q.breakdown,
      nextDay: nextDayHint(s, q, { ...tc, chiefBroken }),
    };
  };

  const chiefOut = chief.map(decorate);
  const secondOut = second.map(decorate);
  const branchOut = branches.map((b) => ({
    ...b,
    leader: b.leader ? decorate(themes.find((t) => t.industry === b.industry).stocks[0]) : null,
    second: b.second ? decorate(themes.find((t) => t.industry === b.industry).stocks[1]) : null,
  }));

  // 卡位龙：全场最高高度中，质量分第一的那只（同高度多只时谁是真龙头）
  if (chiefOut.length > 1) {
    const best = chiefOut.reduce((a, b) => (b.quality > a.quality ? b : a));
    best.isKawci = true;
  }

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
  // 总龙头按质量分降序：卡位龙排第一，弱的 4 板不再和强的 4 板平起平坐
  chiefOut.sort((a, b) => b.quality - a.quality);
  secondOut.sort((a, b) => b.quality - a.quality);

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
      // 是否就是昨日最高板（高度真空的制造者）
      wasTop: prevMax > 0 && (z.lianban || 1) === prevMax,
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
    prevMaxLianban: prevMax,
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
      chiefBroken,
      // 高度变化：正数=高度扩张（情绪向上），负数=高度下降（退潮）
      heightChange: globalMax - prevMax,
      // 有断层的题材数（梯队不完整，持续性差）
      gapThemes: themes.filter((t) => t.gaps.length > 0).map((t) => t.industry),
      // 孤军题材数（只有 1 只 2 板以上，无跟风）
      loneThemes: themes.filter((t) => t.count === 1).map((t) => t.industry),
      kawci: chiefOut.find((c) => c.isKawci)?.name || null,
    },
  };
}
