// 收盘复盘引擎：复盘报告 + 情绪周期定位 + 明日关注 + 交易计划（竞价应对）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAll, reflowScan } from './scan.js';
import { historyState } from './history.js';
import { getQuotes } from './em.js';
import { marketPhase } from './state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'data', 'review');

// 情绪周期定位（启发式，阈值可调）
function cycleStage({ ztCount, dtCount, zbCount, zhaRate, maxLianban, premium }) {
  const prem = premium ? premium.avg : null;
  if (dtCount > ztCount && dtCount >= 10) return ['退潮', '跌停多于涨停，亏钱效应扩散，多看少动'];
  if (ztCount < 20 && (prem != null && prem < 1)) return ['冰点', '涨停稀少且无溢价，等首板尝试新方向'];
  if (ztCount >= 100 && maxLianban >= 5 && prem != null && prem >= 2) return ['高潮', '情绪顶点，持有为主，新开仓只做主流龙头'];
  if (zhaRate != null && zhaRate >= 0.35 && maxLianban >= 3) return ['分歧', '炸板率升高，高位分歧，做分歧转一致的卡位'];
  if (ztCount >= 50 && maxLianban >= 3) return ['发酵', '梯队完整，主流题材可打龙头与跟风'];
  if (ztCount >= 30) return ['启动', '首板增多，试探性参与新题材首板'];
  return ['震荡', '情绪中性，控制仓位，只做确定性机会'];
}

// 复盘报告（盘中/收盘都可用，收盘后即为当日复盘）
export function buildReview(state, phase) {
  const t = state.tick || {};
  const pools = state.pools;
  const sweep = state.marketSweep;

  // 题材热度：按涨停池行业分组
  const themeMap = new Map();
  for (const z of pools.zt || []) {
    const key = z.industry || '其他';
    if (!themeMap.has(key)) themeMap.set(key, { industry: key, count: 0, stocks: [], sealFund: 0 });
    const g = themeMap.get(key);
    g.count++;
    g.sealFund += z.sealFund || 0;
    g.stocks.push({ name: z.name, code: z.code, lianban: z.lianban || 1 });
  }
  const themes = [...themeMap.values()]
    .map((g) => ({ ...g, stocks: g.stocks.sort((a, b) => b.lianban - a.lianban), top: g.stocks[0]?.name }))
    .sort((a, b) => b.count - a.count || b.sealFund - a.sealFund)
    .slice(0, 15);

  // 连板梯队
  const ladder = [];
  for (const z of [...(pools.zt || [])].sort((a, b) => (b.lianban || 1) - (a.lianban || 1))) {
    const h = z.lianban || 1;
    let row = ladder.find((x) => x.height === h);
    if (!row) { row = { height: h, stocks: [] }; ladder.push(row); }
    row.stocks.push({ name: z.name, code: z.code, firstSeal: z.firstSeal, sealFund: z.sealFund });
  }
  ladder.sort((a, b) => b.height - a.height);

  // 明日关注：扫描器结果
  const base = sweep ? scanAll(sweep) : null;
  const reflow = sweep ? reflowScan(sweep, pools) : [];
  const watchTomorrow = {
    fangliang: (base?.fangliang || []).slice(0, 6),
    huita: (base?.huita || []).slice(0, 6),
    reflow: reflow.slice(0, 6),
  };

  const [stage, stageDesc] = cycleStage({
    ztCount: t.ztCount || 0, dtCount: t.dtCount || 0,
    zhaRate: t.zhaRate, maxLianban: t.maxLianban || 0,
    premium: t.premium,
  });

  // 应对策略（模板化，结合评分与周期）
  const strategy = [];
  const env = t.env;
  if (env) {
    strategy.push(`开仓评分 ${env.total}（${env.label}）→ ${env.advice}`);
  }
  strategy.push(`情绪周期处于【${stage}】：${stageDesc}`);
  if (t.maxLianban >= 4) strategy.push(`空间板 ${t.maxLianban} 板是明日情绪风向标：它若继续晋级可参与补涨，若断板则警惕退潮`);
  if (t.premium) strategy.push(`昨日涨停平均溢价 ${t.premium.avg}%（翻红率 ${t.premium.redRate}%），溢价转负当日不接力`);
  const hot = themes[0];
  if (hot) strategy.push(`今日最热方向【${hot.industry}】${hot.count} 家涨停（龙头 ${hot.top}），明日优先在主流方向内选股`);
  strategy.push('风控：单票仓位不超 3 成；打板票炸板无条件走；连亏 2 笔当日停手');

  return {
    date: state.tradingDay,
    generatedAt: Date.now(),
    market: {
      indices: t.indices || [],
      amount2m: t.amount2m,
      amountDeltaPct: t.amountDeltaPct,
      advancers: t.advancers, decliners: t.decliners, flat: t.flat,
    },
    emotion: {
      ztCount: t.ztCount, dtCount: t.dtCount, zbCount: t.zbCount,
      zhaRate: t.zhaRate, maxLianban: t.maxLianban,
      lianbanDist: t.lianbanDist,
      premium: t.premium, jinji: t.jinji, env: t.env,
      cycleStage: stage, cycleDesc: stageDesc,
    },
    themes, ladder, watchTomorrow, strategy,
  };
}

// 收盘后自动落盘（每个交易日一次）
export function saveReviewIfNeeded(state, phase) {
  try {
    if (phase !== 'closed') return;
    const { ymd, minutes, dow } = (() => {
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
      const p = Object.fromEntries(fmt.formatToParts(new Date()).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
      const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return { ymd: `${p.year}${p.month}${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), dow: dowMap[p.weekday] };
    })();
    if (dow === 0 || dow === 6 || minutes < 905) return;
    fs.mkdirSync(DIR, { recursive: true });
    const file = path.join(DIR, `${ymd}.json`);
    if (fs.existsSync(file)) return;
    const review = buildReview(state, phase);
    if (!review.emotion.ztCount && !review.market.indices.length) return;
    fs.writeFileSync(file, JSON.stringify(review));
    console.log('[review] 已生成收盘复盘', ymd);
  } catch (e) {
    console.error('[review]', e.message);
  }
}

// 历史存档日期列表 / 读取指定日期
export function reviewDates() {
  try {
    return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort().reverse();
  } catch {
    return [];
  }
}

export function reviewByDate(date) {
  try {
    if (!/^\d{8}$/.test(date)) return null;
    return JSON.parse(fs.readFileSync(path.join(DIR, `${date}.json`), 'utf8'));
  } catch {
    return null;
  }
}

// 最近一份已保存的复盘
export function latestSavedReview() {
  try {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
    if (!files.length) return null;
    return JSON.parse(fs.readFileSync(path.join(DIR, files.at(-1)), 'utf8'));
  } catch {
    return null;
  }
}

// ---------- 交易计划：关注股的作战卡（最多 3 只，结合情绪周期与套利知识） ----------
function limitRatio(code, isST) {
  if (/^(30|68)/.test(code)) return 0.2;
  if (isST) return 0.05;
  return 0.1;
}

const CHECKPOINTS = [
  ['9:25', '竞价定参与度：高开幅度+竞价量比对照下表；量比 <3 的抢筹一律视为无效'],
  ['9:30-9:40', '只做一件事：看能否站稳分时均价线。站不稳不动手，站上了再对照情景执行'],
  ['10:00', '确认量能：继续放量=主力在场；缩量回落=兑现盘出，持仓减半'],
  ['14:30', '过夜决策：强于所属板块=留；弱于板块或炸板=走，不留弱势票过夜'],
];

// 情绪周期 → 该票的建议参与模式（套利知识写进计划）
function modeFor(stage, lianban, isTheme, strongDay) {
  if (stage === '退潮' || stage === '冰点') {
    return ['空仓观望', '环境差，钱再热也不出手；最多轻仓超跌反抽（1 成以内）'];
  }
  if (lianban && lianban >= 3) {
    if (stage === '高潮') return ['龙头锁仓', '情绪顶点：持有为主，不新开仓；断板/大分歧日兑现一半'];
    if (stage === '分歧') return ['龙头低吸', '分歧日只做低吸不追高：回踩分时均价/5日线缩量企稳接'];
    return ['打板/半路', '主流龙头：打板排单或放量半路，仓位按环境档位执行'];
  }
  if (lianban && lianban <= 2) {
    if (stage === '高潮') return ['谨慎接力', '高位分歧风险大：只做弱转强确认，否则观望'];
    return ['接力/半路', '梯队中段：确认分时站上均价线后参与，不追一字'];
  }
  if (isTheme) {
    if (stage === '发酵' || stage === '高潮') return ['套利板', `主线题材低位首板套利：板块有高度板压制时，半路打其首板或竞价抢筹，吃板块溢价的确定性部分`];
    return ['主线低吸', '主线方向但情绪一般：等缩量回踩 MA5 企稳再接'];
  }
  if (strongDay > 0) return ['低吸回踩', '独立强势股：只做缩量回踩企稳的低吸，不追盘中急拉'];
  return ['观望', '无涨停基因且非主线：放入观察池，出形态再谈'];
}

export async function buildPlans(codes, state) {
  const rows = await getQuotes(codes).catch(() => []);
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const prevZtMap = new Map((state.pools.prevZt || []).map((z) => [z.code, z.lianban || 1]));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

  // 主线题材 = 今日涨停家数前3的行业
  const themeMap = new Map();
  for (const z of state.pools.zt || []) {
    if (!z.industry) continue;
    themeMap.set(z.industry, (themeMap.get(z.industry) || 0) + 1);
  }
  const mainThemes = [...themeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);

  const t = state.tick || {};
  const stage = buildReview(state, marketPhase()).emotion.cycleStage;
  const env = t.env;
  const posByEnv = { 重仓出击: '单票 3 成', 轻仓试错: '单票 2 成', 只看低吸: '单票 1 成', 空仓观望: '0（空仓）' };

  const out = [];
  for (const code of codes) {
    const q = byCode.get(code);
    const name = q?.name || code;
    const isST = /ST/i.test(name);
    const hist0 = historyState.bars[code] || [];
    let h = hist0;
    if (h.length && h.at(-1)[0] === today) h = h.slice(0, -1);
    const closes = h.map((b) => b[2]);
    const ma5 = closes.length >= 5 ? +(closes.slice(-5).reduce((a, b) => a + b, 0) / 5).toFixed(2) : null;
    const ma10 = closes.length >= 10 ? +(closes.slice(-10).reduce((a, b) => a + b, 0) / 10).toFixed(2) : null;
    const ma20 = closes.length >= 20 ? +(closes.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(2) : null;
    const vols = h.map((b) => b[5]);
    const vol5 = vols.length >= 5 ? Math.round(vols.slice(-5).reduce((a, b) => a + b, 0) / 5) : null;

    const lianban = prevZtMap.get(code) || null; // 昨日连板高度（null=昨日非涨停）
    const lr = limitRatio(code, isST);
    const prevClose = q?.prevClose ?? (closes.length ? closes.at(-1) : null);
    const limitPrice = prevClose ? +(prevClose * (1 + lr)).toFixed(2) : null;
    const industry = (state.pools.zt || []).concat(state.pools.prevZt || []).find((z) => z.code === code)?.industry || null;
    const isTheme = industry ? mainThemes.includes(industry) : false;
    let strongDay = 0;
    for (let k = Math.max(1, h.length - 10); k < h.length; k++) {
      if (h[k - 1][2] > 0) {
        const chg = h[k][2] / h[k - 1][2] - 1;
        if (chg >= 0.05 || chg >= 0.093) strongDay++;
      }
    }

    const [mode, modeNote] = modeFor(stage, lianban, isTheme, strongDay);
    const f = (x) => (x != null ? x.toFixed(2) : '-');

    // 竞价情景（带具体价格带）
    const scenarios = [];
    const lo5 = prevClose ? +(prevClose * 1.02).toFixed(2) : null;
    const hi5 = prevClose ? +(prevClose * 1.05).toFixed(2) : null;
    if (lianban) {
      scenarios.push({ cond: `一字/高开>7%（≥${prevClose ? f(prevClose * 1.07) : '-'})`, action: '买不进不挂单；开板放量（封单快速减少）再看回封，回封失败=兑现' });
      scenarios.push({ cond: `高开 5%~7%（${prevClose ? f(prevClose * 1.05) : '-'}~${prevClose ? f(prevClose * 1.07) : '-'}）`, action: '强一致：持有为主；竞价量比>3 可持仓加码；冲高不回封兑现一半' });
      scenarios.push({ cond: `高开 2%~5%（${lo5 ? f(lo5) : '-'}~${hi5 ? f(hi5) : '-'}）`, action: '弱转强确认区：竞价量比>3 且竞价金额>2000万 → 开盘直接参与；否则等 9:40 站上分时均价线再上' });
      scenarios.push({ cond: `高开 0~2%（<${lo5 ? f(lo5) : '-'}）`, action: '不及预期：开盘观察 10 分钟承接，站上分时均价线不破再考虑，不急动手' });
      scenarios.push({ cond: '低开', action: `强转弱：当日放弃接力${ma5 ? `，破 MA5(${ma5}) 无条件走` : ''}；隔日看回流页候选` });
    } else {
      scenarios.push({ cond: `高开 2%+（≥${prevClose ? f(prevClose * 1.02) : '-'}）+ 放量`, action: mode.includes('套利') ? '套利板执行：板块高度板仍在 → 开盘半路上，封板则拿溢价；大盘环境低于轻仓档则放弃' : '突破确认：半路参与，跌破分时均价线止损' });
      scenarios.push({ cond: '平开 ±1%', action: '9:40 前不预测：放量上攻站上分时均价线 → 跟；回落破均价 → 删除' });
      scenarios.push({ cond: `低开 ≤2%（${prevClose ? f(prevClose * 0.98) : '-'}附近）`, action: ma5 ? `等回踩 MA5(${ma5}) 附近缩量企稳（不创分时新低）低吸；破 MA10(${ma10 ?? '-'}) 放弃` : '等企稳信号再谈' });
      scenarios.push({ cond: '低开 >2%', action: '弱势当日不看，除非 10 点前快速翻红带量' });
    }

    // 止损/目标/仓位
    const stopBits = [];
    if (lianban) stopBits.push('炸板回封失败无条件走');
    if (ma5) stopBits.push(`破 MA5(${ma5}) 走`);
    stopBits.push('入场价 -3% 硬止损');
    const targetBits = [];
    if (lianban) targetBits.push(`明日涨停价参考 ${limitPrice ?? '-'}`);
    if (ma10) targetBits.push(`强势期沿 MA10(${ma10}) 持有`);
    targetBits.push('冲高回落至涨幅一半 = 兑现一半');

    out.push({
      code, name,
      price: q?.price ?? null, pct: q?.pct ?? null,
      lianban, ma5, ma10, ma20, vol5,
      volRatio: q?.volRatio ?? null,
      industry, isTheme, stage,
      role: lianban ? (lianban >= 3 ? '龙头候选' : '连板接力') : isTheme ? '主线套利' : strongDay > 0 ? '强势独立' : '观察票',
      mode, modeNote,
      position: env ? (posByEnv[env.label] || '单票 1 成') : '单票 1 成',
      stop: stopBits.join('；'),
      target: targetBits.join('；'),
      checkpoints: CHECKPOINTS,
      scenarios,
    });
  }
  return out;
}
