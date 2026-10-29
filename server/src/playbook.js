// 开盘前操作手册（9:15-9:25 实时生成）
// 综合：昨日收盘复盘结论 × 今日竞价实况 × 大盘环境 → 场景化操作方案
import { buildReview } from './review.js';
import { buildLeaderPool } from './leaderpool.js';

function gapTier(gap) {
  if (gap == null) return 'unknown';
  if (gap >= 7) return 'yizi';
  if (gap >= 5) return 'strong';
  if (gap >= 2) return 'ok';
  if (gap >= 0) return 'weak';
  return 'low';
}

export function buildPlaybook(state, auction) {
  const t = state.tick || {};
  const pools = state.pools;
  const env = t.env;

  let plan = null;
  try { plan = buildReview(state, 'closed')?.tomorrowPlan || null; } catch { plan = null; }
  const leaders = buildLeaderPool(pools, state.tradingDay, false);

  const mode = auction?.mode || 'preview';
  const isLive = mode === 'auction';
  const dirs = (auction?.directions || []).slice(0, 6);
  const rows = auction?.rows || [];

  const yesterdayMain = (plan?.directions?.go || []).map((g) => g.direction);
  const continued = dirs.filter((d) => yesterdayMain.includes(d.direction));
  const newDirs = dirs.filter((d) => !yesterdayMain.includes(d.direction));

  const envScore = env?.total ?? null;
  const envLabel = env?.label || '等待数据';
  const cycle = t.cycleStage || '震荡';
  const heightChange = leaders.stats?.heightChange ?? 0;
  const chiefBroken = !!leaders.stats?.chiefBroken;

  let envLevel;
  if (chiefBroken || cycle === '退潮' || cycle === '冰点' || (envScore != null && envScore < 30)) envLevel = 'freeze';
  else if (envScore != null && envScore >= 75 && (cycle === '发酵' || cycle === '高潮')) envLevel = 'hot';
  else if (envScore != null && envScore >= 50) envLevel = 'warm';
  else envLevel = 'cool';

  const scenes = [];

  // 场景 A：龙头高度板
  const kawci = leaders.chief?.find((c) => c.isKawci) || leaders.chief?.[0] || null;
  if (kawci) {
    const gap = rows.find((r) => r.code === kawci.code)?.gap ?? null;
    const tier = gapTier(gap);
    let act;
    let detail;
    if (tier === 'yizi') {
      act = '买不进，不挂单';
      detail = `一字/接近一字（高开 ${gap}%）。占资金没意义；看开板后能否快速回封，回封失败=出货。`;
    } else if (tier === 'strong') {
      act = (envLevel === 'hot' || envLevel === 'warm') ? '可竞价参与' : '观察至 9:40';
      detail = `高开 ${gap}% 属强一致。环境好可直接竞价；环境一般等 9:40 站稳分时均价线再上。`;
    } else if (tier === 'ok') {
      act = '弱转强确认区';
      detail = `高开 ${gap}% 在 2%~5% 区间。竞价量比 ≥3 且竞价金额 ≥2000万 → 开盘直接参与；否则等 9:40。`;
    } else if (tier === 'weak') {
      act = '不及预期';
      detail = `高开不足 ${gap}%。开盘观察 10 分钟承接，站上分时均价线不破再考虑，不急动手。`;
    } else if (tier === 'low') {
      act = '强转弱，当日放弃';
      detail = `低开 ${gap}%。破 MA5 无条件走；隔日看回流页候选。`;
    } else {
      act = '等竞价数据';
      detail = '竞价时段（9:15-9:25）才有真实高开幅度。';
    }
    scenes.push({
      key: 'chief',
      title: `场景 A · 龙头高度板（${kawci.name} ${kawci.lianban}板 · 质量分 ${kawci.quality}）`,
      level: tier === 'yizi' ? 'warn' : ((tier === 'ok' || tier === 'strong') ? 'go' : 'stop'),
      action: act,
      detail,
      stock: { code: kawci.code, name: kawci.name },
    });
  }

  // 场景 B：一字板买不进 → 同板块套利
  const yiziRows = rows.filter((r) => gapTier(r.gap) === 'yizi');
  if (yiziRows.length > 0) {
    const yiziDirs = new Set(yiziRows.map((r) => r.direction));
    const arbCands = rows.filter((r) =>
      yiziDirs.has(r.direction) &&
      gapTier(r.gap) !== 'yizi' &&
      (r.lianban || 1) <= 2 &&
      r.gap != null && r.gap >= 1
    ).slice(0, 4);
    scenes.push({
      key: 'arb',
      title: `场景 B · 一字板买不进 → 同板块套利（${yiziRows.length} 只一字）`,
      level: 'go',
      action: arbCands.length ? `做同板块低位套利，优先 ${arbCands[0].name}` : '等开盘后看跟风',
      detail: arbCands.length
        ? `一字板（${yiziRows.map((r) => r.name).slice(0, 3).join('/')}）买不进时，做同方向低位首板/二板套利：板块有高度板压制，低位票吃板块溢价的确定性部分，不贪连板。候选：${arbCands.map((r) => `${r.name}${r.lianban ? r.lianban + '板' : ''}(高开${r.gap}%)`).join('、')}。`
        : `一字板集中在 ${[...yiziDirs].slice(0, 2).join('/')}，同方向暂无合适低位票。等 9:30 后看资金是否分流到同板块其他票。`,
      stocks: arbCands.map((r) => ({ code: r.code, name: r.name })),
    });
  }

  // 场景 C：大盘环境好
  if (envLevel === 'hot' || envLevel === 'warm') {
    const mainDirs = continued.length ? continued : dirs.slice(0, 3);
    scenes.push({
      key: 'good',
      title: `场景 C · 大盘环境好（评分 ${envScore} · ${envLabel}）`,
      level: 'go',
      action: '可上主线龙头，注意分歧日兑现',
      detail: `环境支持进攻。优先方向：${mainDirs.map((d) => `${d.direction}(${d.count}只/强度${d.strength})`).join('、')}。仓位按环境档位：${envLevel === 'hot' ? '可到 8 成' : '5 成以内'}。只做主线内的龙头与低位套利，不碰边缘题材。`,
    });
  }

  // 场景 D：大盘环境不好
  if (envLevel === 'cool' || envLevel === 'freeze') {
    scenes.push({
      key: 'bad',
      title: `场景 D · 大盘环境不好（评分 ${envScore} · ${envLabel} · 周期【${cycle}】）`,
      level: 'stop',
      action: envLevel === 'freeze' ? '空仓观望，看盘学习即可' : '只看低吸，不打板',
      detail: envLevel === 'freeze'
        ? `高度真空 + 龙头断板 = 退潮确认。不出手，等新周期启动信号（首板数量回升 + 新题材出现）。若手痒，只做超跌股缩量回踩 MA5 的低吸，1 成以内。`
        : `偏弱环境。仅做强势股缩量回踩低吸，不打板不追高。单票 2 成以内，破位即走。`,
    });
  }

  const directionTable = dirs.map((d) => ({
    direction: d.direction,
    count: d.count,
    strength: d.strength,
    avgGap: d.avgGap,
    top: d.top,
    relation: yesterdayMain.includes(d.direction) ? '主线延续' : (newDirs.includes(d) ? '新方向' : '—'),
    advice: yesterdayMain.includes(d.direction) ? '可做，主线有连续性' : (d.strength >= 200 ? '强度够，可试错首板' : '观察为主'),
  }));

  const oneLiner = envLevel === 'freeze'
    ? `今天空仓观望：${chiefBroken ? '总龙头断板、高度下降' : `周期【${cycle}】`}，评分 ${envScore}。等新周期信号。`
    : envLevel === 'cool'
      ? `今天只看低吸不打板：评分 ${envScore}（${envLabel}）。强势股缩量回踩 MA5 企稳才接，2 成以内。`
      : envLevel === 'hot'
        ? `今天可重仓：评分 ${envScore}（${envLabel}）+ 周期【${cycle}】。主线 ${(continued[0] || dirs[0])?.direction || '-'} 优先，可上龙头。`
        : `今天轻仓试错：评分 ${envScore}（${envLabel}）。主线 ${(continued[0] || dirs[0])?.direction || '-'} 内打首板或低吸，5 成以内。`;

  return {
    tradingDay: state.tradingDay,
    mode,
    isLive,
    generatedAt: Date.now(),
    env: { score: envScore, label: envLabel, level: envLevel, cycle, heightChange, chiefBroken },
    oneLiner,
    scenes,
    directionTable,
    leaders: {
      kawci: kawci ? { code: kawci.code, name: kawci.name, lianban: kawci.lianban, quality: kawci.quality } : null,
      second: leaders.second?.[0] ? { code: leaders.second[0].code, name: leaders.second[0].name, lianban: leaders.second[0].lianban } : null,
      mainThemes: leaders.stats?.mainThemes || [],
    },
    yesterdayPlan: plan ? {
      action: plan.verdict.action,
      go: (plan.directions.go || []).map((g) => g.direction),
      avoid: (plan.directions.avoid || []).map((a) => a.industry),
    } : null,
  };
}
