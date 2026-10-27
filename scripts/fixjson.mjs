// 修正 api() 调用点：api() 已返回 JSON，去掉残留的 .json() 链
import fs from 'node:fs';
const dir = new URL('../web/src/components/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = ['ReviewPage.jsx', 'ScanPage.jsx', 'SectorsPage.jsx', 'AuctionPage.jsx', 'PreMarket.jsx'];
for (const f of files) {
  const p = dir + f;
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  // api('x').then((r) => r.json()) → api('x')
  s = s.replace(/api\('([^']+)'\)\.then\(\(r\) => r\.json\(\)\)/g, "api('$1')");
  // const r = await api(...); const d = await r.json(); → const d = await api(...)
  s = s.replace(/const r = await (api\([^)]*\));\s*\n(\s*)const d = await r\.json\(\);/g, 'const d = await $1;');
  // await (await api('x')).json() → await api('x')
  s = s.replace(/await \(await api\('([^']+)'\)\)\.json\(\)/g, "await api('$1')");
  if (s !== before) fs.writeFileSync(p, s);
  console.log(f, 'changed:', s !== before, '| json残留:', (s.match(/\.json\(\)/g) || []).length);
}
