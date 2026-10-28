// 补丁：auction/earnings 服务端缓存 + plan 复用
import fs from 'node:fs';
const p = new URL('../server/src/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('auctionCache')) {
  s = s.replace(
    'const lhbCache = { date: null, codes: [] };',
    `const lhbCache = { date: null, codes: [] };
const auctionCache = { at: 0, data: null };
const earnCache = { at: 0, data: null };`
  );
  // /api/auction 用缓存
  s = s.replace(
    '  const result = await auctionScan(state.marketSweep, state.pools, phase, { lhbCodes: new Set(lhbCache.codes), lhbDate });',
    `  if (Date.now() - auctionCache.at > 10_000 || !auctionCache.data) {
    auctionCache.data = await auctionScan(state.marketSweep, state.pools, phase, { lhbCodes: new Set(lhbCache.codes), lhbDate }).catch(() => auctionCache.data);
    auctionCache.at = Date.now();
  }
  const result = auctionCache.data;`
  );
  // /api/earnings 用缓存（10 分钟）
  s = s.replace(
    '    res.json(await getEarningsForecast(parseInt(req.query.days, 10) || 3));',
    `    if (Date.now() - earnCache.at > 10 * 60_000 || !earnCache.data) {
      earnCache.data = await getEarningsForecast(parseInt(req.query.days, 10) || 3).catch(() => earnCache.data || []);
      earnCache.at = Date.now();
    }
    res.json(earnCache.data);`
  );
  // /api/plan 复用 auction 缓存
  s = s.replace(
    '    const auction = await auctionScan(state.marketSweep, state.pools, phase, {}).catch(() => ({ directions: [] }));',
    `    if (Date.now() - auctionCache.at > 10_000 || !auctionCache.data) {
      auctionCache.data = await auctionScan(state.marketSweep, state.pools, phase, { lhbCodes: new Set(lhbCache.codes), lhbDate }).catch(() => auctionCache.data);
      auctionCache.at = Date.now();
    }
    const auction = auctionCache.data || { directions: [] };`
  );
  fs.writeFileSync(p, s);
  console.log('缓存补丁 OK');
} else console.log('已存在');
