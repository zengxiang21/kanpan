// 补丁：plan 路由缓存化 + state.js 调度接入
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// 1) index.js: import + plan 路由整体替换为读缓存
{
  const p = root + 'server/src/index.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes("from './plancache.js'")) {
    s = s.replace(
      "import { peersAnalysis } from './peers.js';",
      "import { peersAnalysis } from './peers.js';\nimport { getPlanCache, buildPlansWithTimeout } from './plancache.js';"
    );
  }
  const i = s.indexOf("app.get('/api/plan'");
  const j = s.indexOf('// 竞价存档日期列表', i);
  if (i < 0 || j < 0) { console.error('plan route 定位失败'); process.exit(1); }
  const nw = `app.get('/api/plan', async (req, res) => {
  const codes = String(req.query.codes || '').split(',').map((x) => x.trim()).filter((c) => /^\\d{6}$/.test(c)).slice(0, 6);
  try {
    const plans = codes.length ? await buildPlansWithTimeout(codes, state) : (getPlanCache()?.plans || []);
    res.json({ auto: !codes.length, plans });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

`;
  s = s.slice(0, i) + nw + s.slice(j);
  fs.writeFileSync(p, s);
  console.log('index.js plan 路由缓存化 OK');
}

// 2) state.js: import refreshPlanCache + reviewOnce 调用
{
  const p = root + 'server/src/state.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes("refreshPlanCache } from './plancache.js'")) {
    s = s.replace(
      "import { updateAuctionCloses, saveAuctionSnapshot, getAuctionByDate } from './auctionstore.js';",
      "import { updateAuctionCloses, saveAuctionSnapshot, getAuctionByDate } from './auctionstore.js';\nimport { refreshPlanCache } from './plancache.js';"
    );
  }
  if (!s.includes('await refreshPlanCache(state);')) {
    s = s.replace(
      '        // 云端同步：交易时段每 5 分钟把最新数据推到 GitHub Pages（电脑开着即自动）',
      '        // 交易计划缓存刷新（后台计算，15 秒超时保护）\n        await refreshPlanCache(state);\n        // 云端同步：交易时段每 5 分钟把最新数据推到 GitHub Pages（电脑开着即自动）'
    );
  }
  fs.writeFileSync(p, s);
  console.log('state.js plan 缓存调度 OK');
}
console.log('完成');
