// 数据访问抽象：本地走 /api，GitHub Pages 云端走 /cloud/data.json（Actions 每日生成）
export const CLOUD = !/^(127\.0\.0\.1|localhost|192\.168\.)/.test(location.hostname);

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
