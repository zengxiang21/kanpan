// 补丁：/api/plan 复用块移除未定义的 lhbDate 引用
import fs from 'node:fs';
const p = new URL('../server/src/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let s = fs.readFileSync(p, 'utf8');
const planIdx = s.indexOf("app.get('/api/plan'");
const nextIdx = s.indexOf('app.get(', planIdx + 10);
const seg = s.slice(planIdx, nextIdx);
const fixed = seg.replace(', lhbDate }).catch', ' }).catch');
if (fixed === seg) { console.log('/api/plan 块无 lhbDate（可能已修）'); }
else {
  s = s.slice(0, planIdx) + fixed + s.slice(nextIdx);
  fs.writeFileSync(p, s);
  console.log('/api/plan lhbDate 已移除');
}
