// 板块内对比：同行业排名 + 涨停家数 + 龙头识别 + 能不能买评价
import { industryOf } from './industries.js';
import { historyState } from './history.js';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

export function peersAnalysis(code, sweepRows, pools, tick) {
  const codeS = String(code);
  const industry = industryOf(codeS) || (pools?.zt || []).concat(pools?.prevZt || []).find((z) => z.code === codeS)?.industry || null;
  if (!industry || !sweepRows?.rows?.length) return { industry, error: '行业归属或快照缺失' };

  const peers = sweepRows.rows
    .filter((r) => industryOf(r.code) === industry && Number.isFinite(r.pct))
    .sort((a, b) => b.pct - a.pct);
  const rank = peers.findIndex((p) => p.code === codeS) + 1;
  const limitUps = peers.filter((p) => p.pct >= 9.7).length;
  const prevZtMap = new Map((pools?.prevZt || []).map((z) => [z.code, z.lianban || 1]));
  const me = peers.find((p) => p.code === codeS) || sweepRows.rows.find((r) => r.code === codeS);

  // 板块内龙头榜（前10）：优先今日涨停（连板高→首封早），再按涨幅
  const top = peers.slice(0, 10).map((p) => {
    const zt = (pools?.zt || []).find((z) => z.code === p.code);
    return { code: p.code, name: p.name, pct: p.pct, lianban: zt?.lianban || prevZtMap.get(p.code) || null, firstSeal: zt?.firstSeal || null, sealFund: zt?.sealFund || null, isMe: p.code === codeS };
  });

  // 历史位置（MA5 上方/下方）
  const hist = historyState.bars[codeS] || [];
  let h = hist;
  if (h.length && h.at(-1)[0] === today()) h = h.slice(0, -1);
  const closes = h.map((b) => b[2]);
  const ma5 = closes.length >= 5 ? +(closes.slice(-5).reduce((a, b) => a + b, 0) / 5).toFixed(2) : null;
  const aboveMa5 = ma5 && me?.price ? me.price >= ma5 : null;

  // 能不能买评价
  const env = tick?.env;
  const evalParts = [];
  if (rank === 1 && (me?.pct ?? 0) >= 9.7) evalParts.push(`【${industry}】板块龙头（涨幅第 1、已涨停 ${limitUps} 家联动）`);
  else if (rank <= 3) evalParts.push(`板块内第 ${rank} 名（共 ${peers.length} 只），属前排梯队`);
  else evalParts.push(`板块内第 ${rank} 名（共 ${peers.length} 只），跟风属性，谨慎`);
  if (limitUps >= 3) evalParts.push(`板块效应强（${limitUps} 家涨停），主线确认`);
  else if (limitUps === 0) evalParts.push('板块今日无涨停，效应弱');
  if (aboveMa5 != null) evalParts.push(aboveMa5 ? '站上 MA5，趋势健康' : '跌破 MA5，趋势转弱');
  if (env) evalParts.push(`环境评分 ${env.total}（${env.label}）→ ${env.advice}`);
  const advice =
    env && env.total >= 50 && rank <= 3
      ? '可以参与：做龙头打板/半路，或等回踩低吸；同板块只做前 2 名'
      : rank === 1 && env && env.total >= 30
        ? '轻仓试错：龙头独立性操作，破位即走'
        : '建议观望：板块地位或环境不支持';
  evalParts.push(advice);

  return {
    industry, rank, total: peers.length, limitUps,
    top,
    me: me ? { code: me.code, name: me.name, pct: me.pct, price: me.price } : null,
    ma5, aboveMa5,
    evaluation: evalParts,
  };
}
