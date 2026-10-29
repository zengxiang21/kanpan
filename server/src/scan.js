// 形态选股扫描器：底部放量 / 缩量回踩（基于本地日线历史 + 实时全市场快照）
import { historyState } from './history.js';

// 可调参数（后续做成前端面板）
export const PARAMS = {
  fangliang: {
    volTimes: 2.0,      // 底部放量：今日量 ≥ 5日均量 × 2
    pctMin: 2, pctMax: 9.5,
    capMin: 15e8, capMax: 800e8,
    posMax: 0.4,        // 60日区间位置分位 ≤ 40%（低位）
  },
  huita: {
    pullPctMin: -2.5, pullPctMax: 3,
    maBand: 0.025,
    volShrink: 0.85,
  },
  common: { minPrice: 3, excludeST: true },
};

const TOP_N = 8;        // 每个形态最多输出数量（宁缺毋滥）
const MIN_SCORE = 70;   // 低于该评分的直接过滤

function limitUpRatio(code, isST) {
  if (/^(30|68)/.test(code)) return 0.2;
  if (isST) return 0.05;
  return 0.1;
}

function ma(arr, n) {
  if (arr.length < n) return null;
  const s = arr.slice(-n).reduce((a, b) => a + b, 0);
  return s / n;
}

// hist: [[date,o,c,h,l,vol股],...] 不含今日
function analyzeHistory(hist) {
  const closes = hist.map((b) => b[2]);
  const highs = hist.map((b) => b[3]);
  const vols = hist.map((b) => b[5]);
  const ma5 = ma(closes, 5);
  const ma10 = ma(closes, 10);
  const ma20 = ma(closes, 20);
  const vol5 = vols.length >= 5 ? vols.slice(-5).reduce((a, b) => a + b, 0) / 5 : null;
  let h20 = null;
  if (highs.length >= 20) h20 = Math.max(...highs.slice(-20));
  // 近10日强势基因：单日涨幅 ≥5% 或 近涨停
  let strongDay = 0;
  for (let i = Math.max(1, hist.length - 10); i < hist.length; i++) {
    const prev = hist[i - 1][2];
    if (prev > 0) {
      const chg = hist[i][2] / prev - 1;
      if (chg >= 0.05 || chg >= 0.093) strongDay++;
    }
  }
  return { ma5, ma10, ma20, vol5, h20, strongDay, lastClose: closes.at(-1) };
}

export function scanAll(sweepRows) {
  const meta = {
    historyReady: historyState.meta.count > 0,
    historyCount: historyState.meta.count,
    lastBarDate: historyState.meta.lastBarDate,
    snapshotTime: sweepRows ? sweepRows.updatedAt : null,
    snapshotCount: sweepRows ? sweepRows.rows.length : 0,
    downloading: historyState.progress.running,
    downloadDone: historyState.progress.done,
    downloadTotal: historyState.progress.total,
  };
  const out = { fangliang: [], huita: [], meta };
  if (!sweepRows || !historyState.bars || meta.historyCount < 100) return out;

  const C = PARAMS.common;
  for (const s of sweepRows.rows) {
    if (!Number.isFinite(s.price) || s.price < C.minPrice) continue;
    if (C.excludeST && s.isST) continue;
    if (!Number.isFinite(s.volume) || s.volume <= 0) continue;
    const hist = historyState.bars[s.code];
    if (!hist || hist.length < 25) continue;
    // 历史最新bar若是今天(收盘后更新过)，剔除今天那根，保证"历史不含今日"
    let h = hist;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    if (h.length && h.at(-1)[0] === today) h = h.slice(0, -1);
    if (h.length < 25) continue;

    const a = analyzeHistory(h);
    const reasons = [];
    const volTimes = a.vol5 ? s.volume / a.vol5 : null;
    const isLimitUp = s.prevClose > 0 && s.price >= s.prevClose * (1 + limitUpRatio(s.code, s.isST)) - 0.001;

    // ---- 底部放量（低位首次放量启动） ----
    {
      const P = PARAMS.fangliang;
      let pos = null;
      if (h.length >= 40) {
        const seg = h.slice(-60);
        const l60 = Math.min(...seg.map((b) => b[4]));
        const h60 = Math.max(...seg.map((b) => b[3]));
        if (h60 > l60) pos = (s.price - l60) / (h60 - l60); // 0=最低 1=最高
      }
      let ok = pos != null && pos <= P.posMax;
      if (ok && !(volTimes != null && volTimes >= P.volTimes)) ok = false;
      if (ok && !(s.pct >= P.pctMin && s.pct <= P.pctMax)) ok = false;
      if (ok && isLimitUp) ok = false;
      if (ok && !(a.ma5 && s.price >= a.ma5 * 0.995)) ok = false; // 站上或贴近5日线
      if (ok && !(s.floatCap >= P.capMin && s.floatCap <= P.capMax)) ok = false;
      if (ok) {
        reasons.push(`低位分位 ${(pos * 100).toFixed(0)}%`, `放量 ${volTimes.toFixed(1)} 倍`);
        if (s.price >= a.ma5) reasons.push(`站上MA5(${a.ma5.toFixed(2)})`);
        if (a.strongDay > 0) reasons.push('近10日有强势基因');
        if (s.turnover >= 3 && s.turnover <= 20) reasons.push(`换手 ${s.turnover.toFixed(1)}%`);
        const bPos = Math.round((P.posMax - pos) * 90);      // 越低分越高，满分约36
        const bVol = Math.round(Math.min(volTimes, 4) / 4 * 30); // 满分30
        const bTurn = s.turnover >= 3 && s.turnover <= 20 ? 8 : 0;
        const bMa = s.price >= a.ma5 ? 6 : 0;
        const bStrong = a.strongDay > 0 ? 5 : 0;
        const breakdown = [
          { k: '低位分位', v: bPos }, { k: '量能倍数', v: bVol },
          { k: '换手甜区', v: bTurn }, { k: '站上MA5', v: bMa }, { k: '强势基因', v: bStrong },
        ];
        const score = Math.min(99, 45 + bPos + bVol + bTurn + bMa + bStrong);
        out.fangliang.push(row(s, score, volTimes, reasons, breakdown));
      }
    }

    // ---- 缩量回踩 ----
    {
      const P = PARAMS.huita;
      let ok = a.strongDay > 0;
      if (ok && !(s.pct >= P.pullPctMin && s.pct <= P.pullPctMax)) ok = false;
      if (ok && !(a.ma5 && a.ma10 && a.ma20 && a.ma5 >= a.ma10 && a.ma10 >= a.ma20 * 0.99)) ok = false;
      if (ok && !(s.price >= a.ma20)) ok = false;
      const nearMa =
        (a.ma5 && Math.abs(s.price / a.ma5 - 1) <= P.maBand) ||
        (a.ma10 && Math.abs(s.price / a.ma10 - 1) <= P.maBand);
      if (ok && !nearMa) ok = false;
      if (ok && !(volTimes != null && volTimes <= P.volShrink)) ok = false;
      if (ok && isLimitUp) ok = false;
      if (ok) {
        reasons.push(`近10日强势 ${a.strongDay} 天`);
        reasons.push(`回踩 ${a.ma5 ? 'MA5(' + a.ma5.toFixed(2) + ')' : ''}`);
        reasons.push(`缩量至 ${(volTimes * 100).toFixed(0)}%`);
        const bStrong = Math.min(a.strongDay, 3) * 10;
        const bMa = a.ma5 >= a.ma10 && a.ma10 > a.ma20 ? 14 : 6;
        const bVol = volTimes <= 0.6 ? 14 : 8;
        const bPct = s.pct >= 0 && s.pct <= 2 ? 8 : 4;
        const breakdown = [
          { k: '强势天数', v: bStrong }, { k: '多头排列', v: bMa },
          { k: '极度缩量', v: bVol }, { k: '回踩幅度', v: bPct },
        ];
        const score = Math.min(99, 45 + bStrong + bMa + bVol + bPct);
        out.huita.push(row(s, score, volTimes, reasons, breakdown));
      }
    }
  }

  const pick = (arr) => arr.filter((x) => x.score >= MIN_SCORE).sort((x, y) => y.score - x.score).slice(0, TOP_N);
  out.fangliang = pick(out.fangliang);
  out.huita = pick(out.huita);
  return out;
}

function row(s, score, volTimes, reasons, breakdown) {
  return {
    code: s.code, name: s.name, price: s.price, pct: s.pct,
    volTimes: volTimes != null ? +volTimes.toFixed(2) : null,
    turnover: s.turnover, floatCap: s.floatCap, industry: s.industry,
    direction: industryOf(s.code) || s.industry || null,
    score, breakdown: breakdown || [], reasons,
  };
}

// ---- 回流扫描的公共分析：断板天数（最近一次近涨停在几天前） ----
function daysSinceLimit(hist) {
  for (let i = hist.length - 1, d = 1; i >= 1 && d <= 6; i--, d++) {
    const prev = hist[i - 1][2];
    if (prev > 0 && hist[i][2] / prev - 1 >= 0.093) return d;
  }
  return 99;
}

// ---- 龙头回流预期扫描：龙头断板 1~3 天 + 缩量回调 + 未破 MA10 ----
export function reflowScan(sweepRows, pools) {
  const out = [];
  if (!sweepRows || historyState.meta.count < 100) return out;
  // 题材活口：今日涨停池的行业集合
  const liveIndustries = new Map();
  for (const z of pools?.zt || []) {
    if (z.industry) liveIndustries.set(z.industry, (liveIndustries.get(z.industry) || 0) + 1);
  }
  // 龙头高度参考：昨日连板池
  const prevLianban = new Map((pools?.prevZt || []).map((z) => [z.code, z.lianban || 1]));

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  for (const s of sweepRows.rows) {
    if (!Number.isFinite(s.price) || s.price < 3) continue;
    if (s.isST) continue;
    const hist0 = historyState.bars[s.code];
    if (!hist0 || hist0.length < 25) continue;
    let h = hist0;
    if (h.length && h.at(-1)[0] === today) h = h.slice(0, -1);
    if (h.length < 25) continue;

    const a = analyzeHistory(h);
    if (!a.ma5 || !a.ma10 || !a.vol5) continue;
    const gap = daysSinceLimit(h);
    if (gap < 1 || gap > 3) continue;               // 断板 1~3 天
    const isLimitToday = s.prevClose > 0 && s.price >= s.prevClose * (1 + limitUpRatio(s.code, s.isST)) - 0.001;
    if (isLimitToday) continue;                      // 今天已板，不算回流候选
    if (!(s.pct >= -4 && s.pct <= 3.5)) continue;    // 回调区间
    if (s.price < a.ma10 * 0.97) continue;           // 未有效跌破 MA10
    const volTimes = s.volume / a.vol5;
    if (volTimes > 1.1) continue;                    // 回调期不放量

    const reasons = [`断板第 ${gap} 天`, `回撤中 缩量${Math.round(volTimes * 100)}%`, `距MA10 ${((s.price / a.ma10 - 1) * 100).toFixed(1)}%`];
    let score = 50;
    const lb = prevLianban.get(s.code);
    if (lb && lb >= 3) { score += 20; reasons.push(`昨日${lb}板龙头`); }
    else if (lb && lb === 2) { score += 12; reasons.push('昨日2板'); }
    if (a.strongDay >= 2) { score += 12; reasons.push(`近10日强势${a.strongDay}天`); }
    if (a.ma5 >= a.ma10) { score += 6; reasons.push('MA5仍在MA10上'); }
    const live = s.industry ? liveIndustries.get(s.industry) || 0 : 0;
    if (live > 0) { score += Math.min(10, live * 3); reasons.push(`题材活口 ${live} 家`); }
    if (volTimes <= 0.6) { score += 6; reasons.push('极度缩量'); }

    out.push({ ...row(s, Math.min(99, score), volTimes, reasons), gapDays: gap, prevLianban: lb || null });
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, 50);
}

// ---- 竞价雷达 ----
// mode: auction=9:15-9:25 真实竞价数据；preview=非竞价时段（上一交易日收盘快照，仅供预演）
// 只选有涨停基因的超短票（昨日涨停 或 近10日强势）；输出含方向聚合与龙头排序字段
import { industryOf } from './industries.js';
import { getEarningsForecast } from './em.js';

export async function auctionScan(sweepRows, pools, phase, extras = {}) {
  let earnMap = new Map();
  try { const earn = await getEarningsForecast(3); for (const e of earn) earnMap.set(e.code, e); } catch { /* 可选数据 */ }
  const mode = phase === 'auction' || phase === 'auction_end' ? 'auction' : 'preview';
  const empty = { mode, rows: [], directions: [], note: '', lhbDate: extras.lhbDate || null };
  if (!sweepRows) return { ...empty, note: '等待全市场快照' };
  const prevZtMap = new Map((pools?.prevZt || []).map((z) => [z.code, z.lianban || 1]));
  const todayZtMap = new Map((pools?.zt || []).map((z) => [z.code, z]));
  const lhbSet = extras.lhbCodes || new Set();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

  for (const s of sweepRows.rows) {
    if (!Number.isFinite(s.price) || s.price < 3) continue;
    if (s.isST) continue;
    // 历史与强势基因
    const hist0 = historyState.bars[s.code];
    let a = null;
    if (hist0 && hist0.length >= 25) {
      let h = hist0;
      if (h.length && h.at(-1)[0] === today) h = h.slice(0, -1);
      if (h.length >= 25) a = analyzeHistory(h);
    }
    const strongDay = a ? a.strongDay : 0;
    const lianbanPrev = prevZtMap.get(s.code) || null;
    // 超短资格预筛：必须有涨停基因（昨日涨停 或 近10日大涨/涨停）
    if (!lianbanPrev && strongDay < 1) continue;
    if (!Number.isFinite(s.pct) || !(s.pct >= 1.5 && s.pct <= 7.5)) continue; // 竞价甜区
    const isLimitOpen = s.prevClose > 0 && s.price >= s.prevClose * (1 + limitUpRatio(s.code, s.isST)) - 0.001;
    if (isLimitOpen) continue; // 一字买不进
    if (!Number.isFinite(s.amount) || s.amount < 1e7) continue; // 金额≥1000万，要求活跃

    const reasons = [];
    let score = 40;
    if (mode === 'auction') {
      reasons.push(`竞价高开 ${s.pct.toFixed(1)}%`, `竞价金额 ${(s.amount / 1e4).toFixed(0)}万`);
      score += Math.min(15, s.amount / 1e7);
      if (a && a.vol5) {
        const auctionRatio = s.volume / a.vol5; // 竞价量 / 昨日全天均量
        if (auctionRatio >= 0.005) { score += 8; reasons.push(`竞价强度 ${(auctionRatio * 100).toFixed(2)}%`); }
        if (auctionRatio >= 0.015) { score += 10; reasons.push('竞价抢筹明显'); }
      }
    } else {
      reasons.push(`昨日涨幅 ${s.pct.toFixed(1)}%（模拟高开）`, `昨日成交额 ${(s.amount / 1e8).toFixed(1)}亿`);
      score += Math.min(8, s.amount / 2e7);
    }
    if (lianbanPrev) { score += 12; reasons.push(`昨日${lianbanPrev}板`); }
    if (strongDay > 0) { score += 8; reasons.push(`近10日强势${strongDay}天`); }
    const lhb = lhbSet.has(s.code);
    if (lhb) { score += 8; reasons.push('昨日龙虎榜'); }

    // 今日若已涨停 → 龙头排序字段（首封早/封单大者优先）
    const zt = todayZtMap.get(s.code);
    if (zt) reasons.push(`今日${zt.lianban || 1}板封单${(zt.sealFund / 1e8).toFixed(1)}亿`);

    const direction = industryOf(s.code) || zt?.industry || null;
    empty.rows.push({
      ...row(s, Math.min(99, Math.round(score)), null, reasons),
      direction, amount: s.amount,
      gap: s.pct,               // 竞价涨幅（预演=昨日涨幅）
      lianban: lianbanPrev,
      firstSeal: zt?.firstSeal || null,
      sealFund: zt?.sealFund || null,
      lhb,
      closePct: null, correct: null,
    });
  }

  // 方向聚合：竞价强弱 = 家数 × 平均高开 × 金额（确认今日主攻方向）
  const dmap = new Map();
  for (const r of empty.rows) {
    const key = r.direction || '其他';
    const d = dmap.get(key) || { direction: key, count: 0, sumGap: 0, sumAmount: 0, maxGap: 0, top: null, sealCount: 0 };
    d.count++;
    d.sumGap += r.pct;
    d.sumAmount += r.amount || 0;
    if (r.pct > d.maxGap) { d.maxGap = r.pct; d.top = r.name; d.topCode = r.code; }
    if (r.firstSeal) d.sealCount++;
    dmap.set(key, d);
  }
  empty.directions = [...dmap.values()]
    .map((d) => ({
      direction: d.direction, count: d.count,
      avgGap: +(d.sumGap / d.count).toFixed(2), maxGap: +d.maxGap.toFixed(2),
      amount: Math.round(d.sumAmount), top: d.top, topCode: d.topCode || null, sealed: d.sealCount,
      strength: Math.round(d.count * 2 + (d.sumGap / d.count) * 8 + d.sumAmount / 5e7),
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10);
  empty.rows.sort((x, y) => y.score - x.score);
  empty.rows = empty.rows.slice(0, 40);
  empty.note = mode === 'auction'
    ? '竞价实时数据 · 只含有涨停基因的超短票 · 竞价强度=竞价量/昨日总量'
    : '预演模式（昨日收盘快照）：只显示有涨停基因的超短票；9:15 起自动切换为真实竞价';
  return empty;
}
