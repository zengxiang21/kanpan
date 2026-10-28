// 数据访问抽象：本地/Tailscale 走 /api 实时；GitHub Pages 走 /cloud/data.json（Actions 或本机定时生成）
export const CLOUD = location.hostname.endsWith('.github.io');

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
  if (cloudCache[key] !== undefined) return cloudCache[key];
  if (key === 'reviewDates' || key === 'auctionDates' || key === 'plan') return [];
  return null;
}
