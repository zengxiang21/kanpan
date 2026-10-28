// 一次性补丁：注入 /api/debug 诊断路由
import fs from 'node:fs';
const p = new URL('../server/src/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let s = fs.readFileSync(p, 'utf8');
if (s.includes('/api/debug')) { console.log('已存在'); process.exit(0); }
const anchor = "app.get('/api/health'";
const route = `app.get('/api/debug', (req, res) => {
  const handles = {};
  for (const h of process._getActiveHandles()) handles[h.constructor.name] = (handles[h.constructor.name] || 0) + 1;
  res.json({ handles, memoryMB: Math.round(process.memoryUsage().rss / 1e6), stats: state.stats || null, clients: clients.size });
});

`;
s = s.replace(anchor, route + anchor);
fs.writeFileSync(p, s);
console.log('debug 路由已注入');
