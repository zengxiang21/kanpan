// 补丁：plan 路由缓存化（文件方式，避免 cmd 编码问题）
import fs from 'node:fs';
const p = new URL('../server/src/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('// 交易计划：系统自动推荐 3 只');
const tail = '    if (autoFrom) for (const p of plans) { const m = autoFrom.find((x) => x.code === p.code); if (m) p.from = m.from; }\n    res.json({ auto: !req.query.codes, plans });\n  } catch (e) {\n    res.status(502).json({ error: e.message });\n  }\n});';
const end = s.indexOf(tail, start) + tail.length;
if (start < 0 || end < tail.length) { console.error('定位失败', start, end); process.exit(1); }
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
if (!s.includes("getPlanCache, buildPlansWithTimeout } from './plancache.js'")) {
  s = s.replace(
    "import { peersAnalysis } from './peers.js';",
    "import { peersAnalysis } from './peers.js';\nimport { getPlanCache, buildPlansWithTimeout } from './plancache.js';"
  );
}
s = s.slice(0, start) + nw + s.slice(end);
fs.writeFileSync(p, s);
console.log('plan 路由缓存化完成');
