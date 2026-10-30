// 两融余额 + 机构爆仓风险判断
//
// 数据源：东方财富数据中心（datacenter-web.eastmoney.com）
//   市场汇总 RPTA_RZRQ_LSHJ    融资余额/占流通市值比/融资净买入，实测 671 页 ≈13 年日频
//   个股明细 RPTA_WEB_RZRQ_GGMX 按日期取全市场个股融资余额（实测单日 4486 只）
//
// 「机构爆仓」怎么定义（重要，避免做成拍脑袋指标）：
// 融资盘被强平的触发条件是维持担保比例跌到平仓线（通常 130%），
// 即持仓市值相对负债缩水约 23%。所以爆仓压力可分解为三个可观测因子：
//   1) 杠杆水位：融资余额/流通市值 的历史百分位——水位越高，同等跌幅下越容易连环强平
//   2) 融资盘集中度：个股融资余额占流通比高的票（>5% 即为高杠杆筹码），
//      当日跌幅越大，该股融资盘浮亏越深，越接近强平
//   3) 去杠杆速度：融资余额单日/多日降幅，以及净买入连续为负的天数
//      ——已发生的强平会直接体现为余额快速下降
// 这三项都来自公开数据，不依赖任何内部消息。
//
// 必须说明的局限：
//   - 算不出「具体某家机构是否爆仓」，那是非公开信息；这里算的是
//     「市场层面的强平压力」和「当天哪些融资重仓股最危险」。
//   - 维持担保比例、平仓线因券商和客户而异，本模块用统一的 130% 经验值
//     做定性判断，不用于精确计算。

const HEADERS_EM = { Referer: 'https://data.eastmoney.com', 'User-Agent': 'Mozilla/5.0' };
const SUMMARY_API = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_RZRQ_LSHJ';
const DETAIL_API = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_WEB_RZRQ_GGMX';

// 经验阈值（可按实盘感受调整）
const HIGH_LEVERAGE_PCT = 5;   // 个股融资余额占流通比超过此值视为高杠杆筹码
const MARGIN_CALL_RATIO = 130; // 常见维持担保比例平仓线（%）

async function getJson(url) {
  const r = await fetch(url, { headers: HEADERS_EM });
  if (!r.ok) throw new Error(`东财 HTTP ${r.status}`);
  return r.json();
}

function pctOf(values, v) {
  if (!values.length || v == null) return null;
  let below = 0;
  for (const x of values) if (x < v) below++;
  return +((below / values.length) * 100).toFixed(1);
}

/** 把 YYYYMMDD / YYYY-MM-DD / Date 统一成 YYYY-MM-DD；无法解析返回 null */
function normDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return null;
}

function levelOf(pct) {
  if (pct == null) return { label: '未知', cls: 'muted' };
  if (pct >= 90) return { label: '极高', cls: 'up' };
  if (pct >= 70) return { label: '偏高', cls: 'warn' };
  if (pct >= 30) return { label: '中性', cls: '' };
  if (pct >= 10) return { label: '偏低', cls: 'down' };
  return { label: '极低', cls: 'down' };
}

/**
 * 两融市场汇总 + 杠杆水位百分位
 * @param {number} pages 拉多少页历史算百分位（每页 20 条，默认 30 页 ≈600 交易日）
 */
export async function buildMarginSummary(pages = 30) {
  const n = Number.isFinite(Number(pages)) && Number(pages) > 0 ? Math.min(60, Math.floor(Number(pages))) : 30;
  const url = `${SUMMARY_API}&columns=ALL&pageNumber=1&pageSize=${n * 20}&sortColumns=dim_date&sortTypes=-1&source=WEB&client=WEB`;
  const r = await getJson(url);
  const data = (r?.result?.data || []).slice().reverse(); // 升序
  if (!data.length) throw new Error('两融汇总无数据');

  const latest = data[data.length - 1];
  const ratioSeries = data.map((x) => Number(x.RZYEZB)).filter(Number.isFinite);
  const balanceSeries = data.map((x) => Number(x.RZYE)).filter(Number.isFinite);

  const ratio = Number(latest.RZYEZB);
  const balance = Number(latest.RZYE);
  const netBuy = Number(latest.RZJME);

  // 近 5 日融资余额变化（已发生强平会体现为快速下降）
  const last5 = data.slice(-5);
  const chg5d = last5.length > 1 && last5[0].RZYE
    ? +(((balance - last5[0].RZYE) / last5[0].RZYE) * 100).toFixed(2)
    : null;
  // 连续净买入为负的天数（去杠杆持续性）
  let negStreak = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (Number(data[i].RZJME) < 0) negStreak++;
    else break;
  }

  return {
    date: String(latest.DIM_DATE).slice(0, 10),
    balance,
    balanceYi: +(balance / 1e8).toFixed(0),
    balanceWanYi: +(balance / 1e12).toFixed(3),
    ratio: +ratio.toFixed(3),
    netBuy,
    netBuyYi: +(netBuy / 1e8).toFixed(1),
    floatCap: Number(latest.LTSZ),
    floatCapWanYi: +(Number(latest.LTSZ) / 1e12).toFixed(1),
    pctAll: pctOf(ratioSeries, ratio),
    pctBalance: pctOf(balanceSeries, balance),
    level: levelOf(pctOf(ratioSeries, ratio)),
    chg5d,
    negStreak,
    samples: data.length,
    trend: data.slice(-120).map((x) => [String(x.DIM_DATE).slice(0, 10), +(Number(x.RZYE) / 1e8).toFixed(0)]),
    ratioTrend: data.slice(-120).map((x) => [String(x.DIM_DATE).slice(0, 10), +Number(x.RZYEZB).toFixed(3)]),
    note: `杠杆水位 = 融资余额 / 流通市值，当前 ${ratio.toFixed(2)}%；百分位基于最近 ${data.length} 个交易日。`,
    source: '东方财富数据中心 RPTA_RZRQ_LSHJ',
  };
}

/**
 * 个股融资盘 Top N（按融资余额），并结合当日行情标注强平压力
 * @param {string} date YYYY-MM-DD
 * @param {Array} quotes 当日行情 [{code,name,pct,price}]，可为空
 */
export async function buildMarginHeavy(date, quotes = [], topN = 30) {
  const n = Number.isFinite(Number(topN)) && Number(topN) > 0 ? Math.min(100, Math.floor(Number(topN))) : 30;
  const quoteList = (quotes && quotes.length) ? quotes : [];

  // 东财两融明细是 T+1，请求「今天」通常没数据；最多往前找 5 个自然日
  let used = null;
  let data = [];
  const norm = normDate(date);
  const base = norm ? new Date(`${norm}T00:00:00Z`) : null;
  const startOk = base != null && !Number.isNaN(base.getTime());
  for (let back = 0; back < 5; back++) {
    const d = startOk
      ? new Date(base.getTime() - back * 86400000).toISOString().slice(0, 10)
      : (norm || String(date || '').slice(0, 10));
    try {
      const url = `${DETAIL_API}&columns=ALL&filter=(DATE%3D%27${d}%27)&pageNumber=1&pageSize=${n}&sortColumns=RZYE&sortTypes=-1&source=WEB&client=WEB`;
      const r = await getJson(url);
      const rows = r?.result?.data || [];
      if (rows.length) { used = d; data = rows; break; }
    } catch { /* 该日无数据，继续往前 */ }
  }
  if (!used) return { date: norm || String(date || '').slice(0, 10), rows: [] };

  const qMap = new Map(quoteList.map((q) => [String(q.code), q]));
  const rows = data.map((x) => {
    const q = qMap.get(String(x.SCODE));
    const pct = q && Number.isFinite(q.pct) ? q.pct : null;
    const zb = Number(x.RZYEZB) || 0;
    const heavy = zb >= HIGH_LEVERAGE_PCT;
    // 强平压力：高杠杆筹码 + 当日大跌 = 最危险
    let pressure = 'low';
    if (pct != null) {
      if (heavy && pct <= -7) pressure = 'critical';
      else if (heavy && pct <= -3) pressure = 'high';
      else if (pct <= -7) pressure = 'watch';
    }
    // 粗算再跌多少会触及 130% 平仓线：融资余额占流通比 zb% 意味着
    // 若股价相对「买入均价」跌到 (130/100)/zb 的比例就触线。这里用 zb 近似，
    // 只能表达量级，不用于精确判断（已在模块注释说明局限）。
    const dropToLine = heavy && zb > MARGIN_CALL_RATIO
      ? +(((MARGIN_CALL_RATIO / zb) - 1) * 100).toFixed(1)
      : null;
    return {
      code: String(x.SCODE),
      name: x.SECNAME,
      marginYi: +(Number(x.RZYE) / 1e8).toFixed(2),
      ratio: +zb.toFixed(2),
      buyYi: +(Number(x.RZMRE) / 1e8).toFixed(2),
      netYi: Number(x.RZJME) ? +(Number(x.RZJME) / 1e8).toFixed(2) : null,
      // 偿还/买入比：>1 表示偿还多于买入（撤杠杆），显著 >1 常对应被动强平
      repayRatio: Number(x.RZMRE) > 0 ? +(Number(x.RZCHE) / Number(x.RZMRE)).toFixed(2) : null,
      heavy,
      pct,
      price: q && q.price != null ? q.price : null,
      pressure,
      dropToLine,
    };
  });
  return { date: used, rows };
}

/**
 * 综合爆仓风险判断 + 对投资的影响
 * @param {object} state 服务端 state（用于取当日行情）
 * @param {string} date 交易日 YYYYMMDD 或 YYYY-MM-DD
 */
export async function buildLiquidationRisk(state, date) {
  const d = String(date || '').slice(0, 10);
  // 行情源优先级：全市场快照（5000+ 只，能算出真实的融资重仓股当日跌幅）
  //   > 涨停/炸板池（只覆盖少数，但比没有强）。三者都空就只用杠杆水位与去杠杆速度。
  const sweepRows = state?.marketSweep?.rows || [];
  const poolRows = [...(state?.pools?.zt || []), ...(state?.pools?.zb || []), ...(state?.pools?.dt || [])];
  const quotes = sweepRows.length ? sweepRows : poolRows;
  const [summary, heavyRes] = await Promise.all([
    buildMarginSummary().catch(() => null),
    buildMarginHeavy(d, quotes, 30).catch(() => ({ date: d, rows: [] })),
  ]);
  const heavy = heavyRes?.rows || [];
  const marginDate = heavyRes?.date || d;

  // 因子 1：杠杆水位百分位
  const pct = summary ? summary.pctAll : null;
  // 因子 2：融资重仓股的强平信号
  //   2a 偿还比：RZCHE/RZMRE 升高 = 偿还多于买入，是被动强平/撤杠杆的直接体现
  //   2b 跌停交集：融资重仓股当日跌停（用跌停池匹配，覆盖少但确定）
  const withRatio = heavy.filter((h) => h.repayRatio != null);
  const avgRepayRatio = withRatio.length
    ? +(withRatio.reduce((a, h) => a + h.repayRatio, 0) / withRatio.length).toFixed(2)
    : null;
  const forcedOut = withRatio.filter((h) => h.repayRatio >= 1.5);
  const limitDownSet = new Set((state?.pools?.dt || []).map((x) => String(x.code)));
  const heavyInLimitDown = heavy.filter((h) => limitDownSet.has(h.code));
  // 有全市场行情时才算得出真实跌幅（交易时段）
  const withPct = heavy.filter((h) => h.pct != null);
  const critical = withPct.filter((h) => h.pressure === 'critical');
  const highRisk = withPct.filter((h) => h.pressure === 'high' || h.pressure === 'critical');
  const avgPct = withPct.length
    ? +(withPct.reduce((a, h) => a + h.pct, 0) / withPct.length).toFixed(2)
    : null;
  // 因子 3：去杠杆速度
  const chg5d = summary ? summary.chg5d : null;
  const negStreak = summary ? summary.negStreak : 0;

  // 评分：水位 50 + 重仓股当日表现 30 + 去杠杆速度 20
  let score = 0;
  if (pct != null) score += Math.min(50, (pct / 100) * 50);
  // 因子2：有真实跌幅就用跌幅；否则用偿还比（1.0 为界，2.0 封顶折算 30 分）
  if (avgPct != null) score += Math.max(0, Math.min(30, (-avgPct / 8) * 30));
  else if (avgRepayRatio != null) score += Math.max(0, Math.min(30, ((avgRepayRatio - 1) / 1) * 30));
  if (chg5d != null) score += Math.max(0, Math.min(20, (-chg5d / 6) * 20));
  score = Math.round(score);

  let level;
  if (score >= 70) level = { label: '爆仓压力大', cls: 'up' };
  else if (score >= 45) level = { label: '爆仓压力偏高', cls: 'warn' };
  else if (score >= 25) level = { label: '爆仓压力中性', cls: '' };
  else level = { label: '爆仓压力低', cls: 'down' };

  // 对投资的影响：分场景直接给动作
  const impacts = [];
  if (pct != null && pct >= 80) {
    impacts.push(`全市场杠杆水位处于近 ${summary.samples} 个交易日 ${pct}% 分位，融资盘沉重；同等跌幅下更容易触发连环强平，早盘若快速下探要防「多杀多」。`);
  } else if (pct != null && pct <= 20) {
    impacts.push(`杠杆水位仅 ${pct}% 分位，融资盘已充分出清；向下的强平抛压有限，若出现恐慌下跌更可能是机会而非风险。`);
  }
  if (critical.length) {
    impacts.push(`${critical.length} 只融资重仓股当日跌幅超 7%（${critical.slice(0, 5).map((h) => h.name).join('、')}），这些票的融资盘最接近强平线，次日容易再有被动砸盘，勿轻易抄底。`);
  }
  if (avgRepayRatio != null && avgRepayRatio >= 1.3) {
    impacts.push('融资重仓股平均偿还/买入比达 ' + avgRepayRatio + '（>1 即偿还多于买入），' + forcedOut.length + ' 只超过 1.5——偿还显著大于买入通常对应被动强平或集中撤杠杆，这类票次日容易延续弱势。');
  }
  if (heavyInLimitDown.length) {
    impacts.push(heavyInLimitDown.length + ' 只融资重仓股当日跌停（' + heavyInLimitDown.slice(0, 5).map((h) => h.name).join('、') + '），跌停会导致融资盘无法平仓、风险直接传导至券商，需警惕连续跌停引发的连锁强平。');
  }
  if (chg5d != null && chg5d <= -3) {
    impacts.push(`融资余额 5 日下降 ${Math.abs(chg5d)}%，去杠杆正在进行；历史上去杠杆尾声往往对应阶段性底部，可开始观察但不宜重仓抢跑。`);
  }
  if (negStreak >= 3) {
    impacts.push(`融资净买入已连续 ${negStreak} 日为负，杠杆资金持续撤离；此时反弹多由非杠杆资金驱动，持续性需看量能是否配合。`);
  }
  if (!impacts.length) {
    impacts.push('当前杠杆水位与融资重仓股表现均无明显异动，爆仓不是当下的主要矛盾，按既有情绪周期节奏操作即可。');
  }

  return {
    date: d,
    marginDate,
    quoteSource: sweepRows.length ? '全市场快照' : (poolRows.length ? '涨停/炸板池' : '无行情'),
    score,
    level,
    summary,
    factors: {
      leveragePct: pct,
      leverageSamples: summary ? summary.samples : null,
      heavyAvgPct: avgPct,
      heavyAvgRepayRatio: avgRepayRatio,
      forcedOutCount: forcedOut.length,
      heavyInLimitDownCount: heavyInLimitDown.length,
      criticalCount: critical.length,
      highRiskCount: highRisk.length,
      balanceChg5d: chg5d,
      negStreak,
    },
    heavyStocks: heavy
      .slice()
      .sort((a, b) => (limitDownSet.has(b.code) ? 1 : 0) - (limitDownSet.has(a.code) ? 1 : 0)
        || (b.repayRatio || 0) - (a.repayRatio || 0))
      .slice(0, 20),
    impacts,
    note: '爆仓压力由三个公开数据因子加权：杠杆水位历史百分位(50) + 融资重仓股强平信号(30，交易时段用当日跌幅、非交易时段用偿还/买入比) + 融资余额去杠杆速度(20)。算不出具体某家机构是否爆仓，这里是市场层面的强平压力。',
    source: '东方财富数据中心（两融汇总 + 个股明细）',
  };
}
