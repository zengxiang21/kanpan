// 数据访问抽象：本地/Tailscale 走 /api 实时；GitHub Pages 走 /cloud/data.json（Actions 或本机定时生成）
export const CLOUD = location.hostname.endsWith('.github.io');


// 云端模式下的复盘聚合（服务端 buildAnomalyReview 的同口径简化版）
function buildReviewFromEvents(events) {
  if (!events || !events.length) return { total: 0, byType: {}, byHour: [], topMovers: [], zhaTop: [], sealDrop: [], note: '该日无异动记录' };
  const byType = {};
  const byHour = new Map();
  const moverMax = new Map();
  const zha = [];
  const sealDrop = [];
  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    const h = new Date(e.t + 8 * 3600 * 1000).getUTCHours();
    byHour.set(h, (byHour.get(h) || 0) + 1);
    if (e.type === '急拉' || e.type === '跳水') {
      const p = moverMax.get(e.code);
      if (!p || Math.abs(e.delta) > Math.abs(p.delta)) moverMax.set(e.code, e);
    }
    if (e.type === '炸板') zha.push(e);
    if (e.type === '封单骤减') sealDrop.push(e);
  }
  return {
    total: events.length,
    byType,
    byHour: [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count })),
    topMovers: [...moverMax.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 30)
      .map((e) => ({ code: e.code, name: e.name, type: e.type, delta: e.delta, from: e.from, to: e.to, price: e.price, time: e.t, strong: Math.abs(e.delta) >= 3 })),
    zhaTop: zha.sort((a, b) => b.t - a.t).slice(0, 20).map((e) => ({ code: e.code, name: e.name, pct: e.to, firstSeal: e.firstSeal, zhaCount: e.zhaCount, time: e.t })),
    sealDrop: sealDrop.slice(-20).reverse().map((e) => ({ code: e.code, name: e.name, sealBefore: e.sealBefore, sealNow: e.sealNow, pct: e.to, time: e.t })),
    note: '云端快照口径：全市场相邻两轮快照对比；急拉/跳水=涨跌幅变化>=1.5%，触板/跌停=本轮新达到。',
  };
}

let cloudCache = null;
export async function api(path) {
  if (!CLOUD) {
    const r = await fetch('/api/' + path);
    return r.json();
  }
  if (!cloudCache) {
    cloudCache = await fetch('/cloud/data.json').then((r) => r.json());
  }
  const key = path.split('?')[0];
  if (key === 'snapshot') return cloudCache.snapshot;
  // 快照里按子对象存的接口，做一层 key 映射
  if (key === 'anomaly/today') return cloudCache.anomaly?.today || { events: [] };
  if (key === 'anomaly/dates') return cloudCache.anomaly?.dates || [];
  if (key === 'anomaly/review') {
    // 复盘按日期取，云端快照只存当日；非当日日期返回空
    const d = String(path.split('date=')[1] || '');
    const today = cloudCache.anomaly?.today;
    if (d && today && today.date === d && today.events) {
      return buildReviewFromEvents(today.events);
    }
    return { date: d, total: 0, byType: {}, byHour: [], topMovers: [], zhaTop: [], sealDrop: [], note: '云端快照仅含当日异动，历史日期请用本地模式查看' };
  }
  // 快照里的顶层字段即可直接命中；earnings/us 的 key 含斜杠，需显式映射
  if (key === 'earnings/us') return cloudCache.earnings || { events: [] };
  if (cloudCache[key] !== undefined) return cloudCache[key];
  if (key === 'reviewDates' || key === 'auctionDates' || key === 'plan') return [];
  return null;
}
