// 情绪周期六阶段：判定 + 打法（全站唯一真相源）
// 原先 state.js 与 review.js 各存一份逐行复制的 cycleStage，且前端 PreMarket 又硬编码
// 第三份 playbook 字典，三处文案已互相矛盾（分歧阶段前端写"兑现为主"，服务端口径是低吸）。
// 现在统一收口到本模块：改阈值/改文案只改这一处。

// 阶段 → 总纲打法（盘前决策页 / 知识库 / 交易计划卡共用）
export const PLAYBOOK = {
  冰点: '空仓或只做超跌反抽；盯首板尝试新方向',
  启动: '试错新题材首板、低位二板，控制仓位',
  发酵: '打龙头、做跟风套利，主流题材可重仓',
  高潮: '持有为主，龙头锁仓；新增仓位只做主流',
  分歧: '兑现为主，只做分歧转一致的卡位；不追高',
  退潮: '空仓看戏，等冰点；做也只能低吸超跌',
  震荡: '控制仓位，只做确定性机会',
};

// 阶段 → 判定依据说明（复盘页展示"为什么判成这个阶段"）
const STAGE_DESC = {
  冰点: '涨停稀少且无溢价，赚钱效应冰点',
  启动: '首板增多，新题材开始试盘',
  发酵: '梯队完整，主流题材持续扩散',
  高潮: '情绪顶点，赚钱效应最强',
  分歧: '炸板率升高，高位开始分歧',
  退潮: '跌停多于涨停，亏钱效应扩散',
  震荡: '情绪中性，无明确方向',
};

/**
 * 情绪周期定位
 *
 * 阈值设计说明（2026-10-29 重排）：
 * - 原版把「高潮」要求成 涨停≥100 且 最高板≥5 且 溢价≥2% 三条同时成立，
 *   且「分歧」排在「高潮」之前，导致炸板率一高就永远判分歧，高潮实际不可达。
 * - 原版「分歧」没有涨停数下限，小市（涨停 20 只 + 3 板 + 炸板率高）也会被判分歧。
 * - 现在：先看亏钱效应（退潮/冰点），再用炸板率抓分歧，再放行高潮，最后才是发酵/启动。
 *   分歧加涨停≥25 的下限，避免小市误判。
 *
 * @param {object} o
 * @param {number} o.ztCount   涨停家数
 * @param {number} o.dtCount   跌停家数
 * @param {number|null} o.zhaRate 炸板率（炸板数 / (涨停+炸板)）
 * @param {number} o.maxLianban 最高连板高度
 * @param {{avg:number}|null} o.premium 昨日涨停溢价
 * @returns {{stage:string, desc:string, playbook:string}}
 */
export function cycleStage({ ztCount = 0, dtCount = 0, zhaRate = null, maxLianban = 0, premium = null }) {
  const prem = premium ? premium.avg : null;
  const zt = Number(ztCount) || 0;
  const dt = Number(dtCount) || 0;
  const lb = Number(maxLianban) || 0;
  const zr = zhaRate == null ? null : Number(zhaRate);

  let stage;
  if (dt > zt && dt >= 10) stage = '退潮';
  else if (zt < 20 && prem != null && prem < 1) stage = '冰点';
  else if (zt >= 25 && zr != null && zr >= 0.30 && lb >= 3) stage = '分歧';
  else if (zt >= 80 && lb >= 4 && (zr == null || zr < 0.30)) stage = '高潮';
  else if (zt >= 50 && lb >= 3) stage = '发酵';
  else if (zt >= 30) stage = '启动';
  else stage = '震荡';

  return { stage, desc: STAGE_DESC[stage], playbook: PLAYBOOK[stage] };
}

// 兼容旧调用方：返回 [stage, desc] 二元组
export function cycleStagePair(o) {
  const { stage, desc } = cycleStage(o);
  return [stage, desc];
}
