// 云端快照生成：CI 环境跑一次全量数据，输出 cloud/data.json 供 GitHub Pages 静态站使用
// 用法: node scripts/ci-snapshot.mjs （在仓库根目录）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, marketPhase, runSweep, refreshPools, refreshTick } from '../server/src/state.js';
import { buildReview, saveReviewIfNeeded } from '../server/src/review.js';
import { scanAll, reflowScan, auctionScan } from '../server/src/scan.js';
import { getGlobal, getUSStocks, getSentiment, getSectorBoard, getNews, getLHBCodes } from '../server/src/em.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('[ci] 拉取数据…');
  // 预热：涨停池 + 全市场扫描 + tick
  await refreshPools().catch((e) => console.error('[ci] pools', e.message));
  await runSweep().catch((e) => console.error('[ci] sweep', e.message));
  await refreshTick().catch((e) => console.error('[ci] tick', e.message));

  const phase = marketPhase();
  const [review, scanBase, reflow, global, us, sentiment, sectors, news] = await Promise.all([
    Promise.resolve(buildReview(state, phase)),
    Promise.resolve(scanAll(state.marketSweep)),
    Promise.resolve(reflowScan(state.marketSweep, state.pools)),
    getGlobal().catch(() => []),
    getUSStocks().catch(() => []),
    getSentiment().catch(() => ({ themes: [] })),
    getSectorBoard().catch(() => []),
    getNews(30).catch(() => []),
  ]);

  // 竞价雷达（当日存档或预演）
  let auction;
  try {
    const lhbCodes = new Set(await getLHBCodes(state.pools.prevDate || state.tradingDay).catch(() => []));
    auction = auctionScan(state.marketSweep, state.pools, phase, { lhbCodes, lhbDate: state.pools.prevDate });
  } catch {
    auction = { mode: 'preview', rows: [], directions: [], note: '' };
  }

  const data = {
    generatedAt: Date.now(),
    phase,
    tradingDay: state.tradingDay,
    snapshot: { tick: state.tick, pools: state.pools },
    review,
    scan: { ...scanBase, reflow },
    auction,
    global, us, sentiment, sectors, news,
  };

  const outDir = path.join(__dirname, '..', 'cloud');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(data));
  console.log('[ci] cloud/data.json 完成 ·', Object.keys(data).join(','));
  // 顺手落盘本地复盘（与本地服务一致）
  saveReviewIfNeeded(state, phase);
  process.exit(0);
}

main();
