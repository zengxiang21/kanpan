// 补丁：plan 路由缓存化（以注释行锚点替换整个路由）
import fs from 'node:fs';
const p = new URL('../server/src/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let s = fs.readFileSync(p, 'utf8');
const startMarker = "// 交易计划：系统自动推荐 3 只（空间板龙头/回流/放量/回踩）或指定关注股";
const endMarker = "// 竞价存档日期列表";
const i = s.indexOf(startMarker);
const j = s.indexOf(endMarker, i);
if (i < 0 || j < 0) { console.error('锚点缺失', i, j); process.exit(1); }
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
if (!s.includes("getPlanCache, buildPlansWithTimeout } from './plancache.js'")) {
  s = s.replace(
    "import { peersAnalysis } from './peers.js';",
    "import { peersAnalysis } from './peers.js';\nimport { getPlanCache, buildPlansWithTimeout } from './plancache.js';"
  );
}
fs.writeFileSync(p, s);
console.log('plan 路由缓存化完成');
