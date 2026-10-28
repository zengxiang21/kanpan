// 补丁：交易计划自动推荐（系统挑 3 只生成作战卡）
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// --- index.js: /api/plan 无 codes 时自动推荐 ---
{
  const p = root + 'server/src/index.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('autoFrom')) {
    s = s.replace(
      `// 交易计划：关注股的竞价应对表
app.get('/api/plan', async (req, res) => {
  const codes = String(req.query.codes || '').split(',').map((s) => s.trim()).filter((c) => /^\\d{6}$/.test(c)).slice(0, 8);
  try {
    res.json(await buildPlans(codes, state));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});`,
      `// 交易计划：系统自动推荐 3 只（空间板龙头/回流/放量/回踩）或指定关注股
app.get('/api/plan', async (req, res) => {
  let codes = String(req.query.codes || '').split(',').map((x) => x.trim()).filter((c) => /^\\d{6}$/.test(c)).slice(0, 3);
  let autoFrom = null;
  if (!codes.length && state.marketSweep) {
    const scan = scanAll(state.marketSweep);
    const reflow = reflowScan(state.marketSweep, state.pools);
    const cands = [];
    const ztTop = [...state.pools.zt].sort((a, b) => (b.lianban || 1) - (a.lianban || 1))[0];
    if (ztTop && (ztTop.lianban || 1) >= 2) cands.push({ code: ztTop.code, from: \`空间板 \${ztTop.lianban}板龙头\` });
    if (reflow[0]) cands.push({ code: reflow[0].code, from: '龙头回流预期' });
    if (scan.fangliang[0]) cands.push({ code: scan.fangliang[0].code, from: '底部放量' });
    if (scan.huita[0]) cands.push({ code: scan.huita[0].code, from: '缩量回踩' });
    const seen = new Set();
    autoFrom = [];
    for (const c of cands) {
      if (!seen.has(c.code)) { seen.add(c.code); autoFrom.push(c); }
      if (seen.size >= 3) break;
    }
    codes = [...seen];
  }
  try {
    const plans = await buildPlans(codes, state);
    if (autoFrom) for (const p of plans) { const m = autoFrom.find((x) => x.code === p.code); if (m) p.from = m.from; }
    res.json({ auto: !req.query.codes, plans });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});`
    );
    fs.writeFileSync(p, s);
    console.log('index.js 自动推荐 OK');
  } else console.log('index.js 已有');
}
console.log('完成');
