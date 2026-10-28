// 补丁：自动推荐扩到 6 只（多来源多候选）
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// --- index.js: 候选扩充 + 上限 6 ---
{
  const p = root + 'server/src/index.js';
  let s = fs.readFileSync(p, 'utf8');
  const old = `    const ztTop = [...state.pools.zt].sort((a, b) => (b.lianban || 1) - (a.lianban || 1))[0];
    if (ztTop && (ztTop.lianban || 1) >= 2) push(ztTop.code, 40, \`空间板 \${ztTop.lianban}板龙头\`);
    if (reflow[0]) push(reflow[0].code, 32, '龙头回流预期');
    if (reflow[1]) push(reflow[1].code, 24, '龙头回流预期(次选)');
    if (scan.fangliang[0]) push(scan.fangliang[0].code, 28, '底部放量');
    if (scan.huita[0]) push(scan.huita[0].code, 26, '缩量回踩');`;
  const nw = `    const ztTop = [...state.pools.zt].sort((a, b) => (b.lianban || 1) - (a.lianban || 1))[0];
    if (ztTop && (ztTop.lianban || 1) >= 2) push(ztTop.code, 40, \`空间板 \${ztTop.lianban}板龙头\`);
    for (let i = 0; i < Math.min(2, reflow.length); i++) push(reflow[i].code, 32 - i * 8, i === 0 ? '龙头回流预期' : '龙头回流(次选)');
    for (let i = 0; i < Math.min(2, scan.fangliang.length); i++) push(scan.fangliang[i].code, 28 - i * 6, i === 0 ? '底部放量' : '底部放量(次选)');
    if (scan.huita[0]) push(scan.huita[0].code, 26, '缩量回踩');`;
  if (!s.includes(old)) { console.error('cands anchor miss'); process.exit(1); }
  s = s.replace(old, nw);
  s = s.replace('      if (seen.size >= 3) break;', '      if (seen.size >= 6) break;');
  s = s.replace('  let codes = String(req.query.codes || \'\').split(\',\').map((x) => x.trim()).filter((c) => /^\\d{6}$/.test(c)).slice(0, 3);', '  let codes = String(req.query.codes || \'\').split(\',\').map((x) => x.trim()).filter((c) => /^\\d{6}$/.test(c)).slice(0, 6);');
  fs.writeFileSync(p, s);
  console.log('index.js 推荐 6 只 OK');
}

// --- review.js: buildPlans 支持最多 6 只 ---
{
  const p = root + 'server/src/review.js';
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace('const rows = await getQuotes(codes).catch(() => []);', 'const rows = await getQuotes(codes.slice(0, 6)).catch(() => []);');
  s = s.replace('  const out = [];\n  for (const code of codes) {', '  const out = [];\n  for (const code of codes.slice(0, 6)) {');
  fs.writeFileSync(p, s);
  console.log('review.js buildPlans 6 只 OK');
}
console.log('完成');
