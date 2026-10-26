// 收盘复盘引擎：复盘报告 + 情绪周期定位 + 明日关注 + 交易计划（竞价应对）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAll, reflowScan } from './scan.js';
import { historyState } from './history.js';
import { getQuotes } from './em.js';

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

// ---------- 交易计划：关注股的竞价应对表 ----------
function limitRatio(code, isST) {
  if (/^(30|68)/.test(code)) return 0.2;
  if (isST) return 0.05;
  return 0.1;
}

export async function buildPlans(codes, state) {
  const rows = await getQuotes(codes).catch(() => []);
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const prevZtMap = new Map((state.pools.prevZt || []).map((z) => [z.code, z.lianban || 1]));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

  const out = [];
  for (const code of codes) {
    const q = byCode.get(code);
    const name = q?.name || code;
    const hist0 = historyState.bars[code] || [];
    let h = hist0;
    if (h.length && h.at(-1)[0] === today) h = h.slice(0, -1);
    const closes = h.map((b) => b[2]);
    const ma5 = closes.length >= 5 ? +(closes.slice(-5).reduce((a, b) => a + b, 0) / 5).toFixed(2) : null;
    const ma10 = closes.length >= 10 ? +(closes.slice(-10).reduce((a, b) => a + b, 0) / 10).toFixed(2) : null;
    const vols = h.map((b) => b[5]);
    const vol5 = vols.length >= 5 ? Math.round(vols.slice(-5).reduce((a, b) => a + b, 0) / 5) : null;

    const lianban = prevZtMap.get(code) || null;       // 昨日连板高度（null=非昨日涨停）
    const limitPct = limitRatio(code, /ST/i.test(name)) * 100;
    const scenarios = [];
    if (lianban) {
      scenarios.push({ cond: `高开 5%~${(limitPct - 0.5).toFixed(0)}%`, action: '强一致：持有为主，竞价量比>3 可加仓；冲高不回封兑现一半' });
      scenarios.push({ cond: '高开 2%~5%', action: '标准弱转强确认区：竞价量比>3 且金额>2000万 → 竞价/开盘参与；否则等 9:40 分时确认' });
      scenarios.push({ cond: '高开 0~2%', action: '不及预期：开盘看 10 分钟承接，站上分时均价线再说，不急动手' });
      scenarios.push({ cond: '低开', action: '强转弱：当日放弃接力，破 MA10 无条件走；观察 2 日内回流机会' });
      scenarios.push({ cond: '一字板', action: '买不进不挂单；开板放量再评估（开板一字有分歧价值）' });
    } else {
      scenarios.push({ cond: '高开 2% 以上 + 放量', action: '突破确认：可半路参与，仓位轻于打板；跌破分时均价线止损' });
      scenarios.push({ cond: '平开 ±1%', action: '看 9:40 前方向：放量站上分时均价线再动手，不预测' });
      scenarios.push({ cond: '低开 2% 以内', action: '回看 MA5 附近：缩量企稳（不创分时新低）可低吸，破 MA10 放弃' });
      scenarios.push({ cond: '低开 2% 以上', action: '弱势当日不看，除非快速翻红带量' });
    }
    if (ma5) scenarios.push({ cond: '关键位', action: `MA5=${ma5}${ma10 ? ' / MA10=' + ma10 : ''}：回踩不破是低吸参考，有效跌破放弃` });

    out.push({
      code, name,
      price: q?.price ?? null, pct: q?.pct ?? null,
      lianban, ma5, ma10, vol5,
      volRatio: q?.volRatio ?? null,
      scenarios,
    });
  }
  return out;
}
