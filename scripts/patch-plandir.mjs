// 补丁：/api/plan 自动推荐结合竞价方向强弱重排
import fs from 'node:fs';
const p = new URL('../server/src/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let s = fs.readFileSync(p, 'utf8');
const old = `  let autoFrom = null;
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
});`;
const nw = `  let autoFrom = null;
  if (!codes.length && state.marketSweep) {
    const scan = scanAll(state.marketSweep);
    const reflow = reflowScan(state.marketSweep, state.pools);
    // 竞价方向强弱：方向榜排名 → 推荐时方向加成
    const auction = await auctionScan(state.marketSweep, state.pools, phase, {}).catch(() => ({ directions: [] }));
    const dirRank = new Map((auction.directions || []).map((d, i) => [d.direction, { rank: i + 1, strength: d.strength, count: d.count }]));
    const dirBoost = (direction) => {
      const r = dirRank.get(direction);
      if (!r) return { boost: 0, label: '' };
      return { boost: [30, 22, 15, 10, 6][r.rank - 1] || 4, label: \`竞价方向第\${r.rank}强(\${r.count}只)\` };
    };
    const cands = [];
    const push = (code, base, baseLabel) => {
      const direction = industryOf(code) || null;
      const { boost, label } = dirBoost(direction);
      cands.push({ code, base, baseLabel, direction, boost, dirLabel: label });
    };
    const ztTop = [...state.pools.zt].sort((a, b) => (b.lianban || 1) - (a.lianban || 1))[0];
    if (ztTop && (ztTop.lianban || 1) >= 2) push(ztTop.code, 40, \`空间板 \${ztTop.lianban}板龙头\`);
    if (reflow[0]) push(reflow[0].code, 32, '龙头回流预期');
    if (reflow[1]) push(reflow[1].code, 24, '龙头回流预期(次选)');
    if (scan.fangliang[0]) push(scan.fangliang[0].code, 28, '底部放量');
    if (scan.huita[0]) push(scan.huita[0].code, 26, '缩量回踩');
    // 总分 = 基础优先级 + 方向竞价强度加成（方向强者前排）
    cands.sort((a, b) => (b.base + b.boost) - (a.base + a.boost));
    const seen = new Set();
    autoFrom = [];
    for (const c of cands) {
      if (!seen.has(c.code)) { seen.add(c.code); autoFrom.push({ code: c.code, from: c.dirLabel ? \`\${c.baseLabel} · \${c.dirLabel}\` : c.baseLabel }); }
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
});`;
if (!s.includes(old)) { console.error('anchor miss'); process.exit(1); }
s = s.replace(old, nw);
fs.writeFileSync(p, s);
console.log('plan 方向强度重排 OK');
