// 展示格式化：A股惯例 红涨绿跌
export function num(v) {
  return Number.isFinite(v) ? v : null;
}

export function fmtPrice(v) {
  return num(v) !== null ? v.toFixed(2) : '-';
}

export function fmtPct(v) {
  return num(v) !== null ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '-';
}

export function pctCls(v) {
  if (v > 0) return 'up';
  if (v < 0) return 'down';
  return 'flat';
}

// 元 → 亿 / 万
export function fmtAmount(v) {
  if (num(v) === null) return '-';
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(0) + '万';
  return String(v);
}

export function fmtCap(v) {
  return num(v) !== null ? (v / 1e8).toFixed(1) + '亿' : '-';
}

export function fmtInt(v) {
  return num(v) !== null ? String(Math.round(v)) : '-';
}

export function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour12: false }) : '-';
}

export const PHASE_LABEL = {
  auction: '集合竞价',
  auction_end: '竞价结束',
  open: '交易中',
  closed: '已收盘',
};
