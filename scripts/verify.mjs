// 端到端验证：快照数据 + SSE 推送（node 无原生 EventSource，手写 SSE 解析）
const r = await fetch('http://127.0.0.1:8000/api/snapshot');
const s = await r.json();
const t = s.tick;
console.log('--- 快照 ---');
console.log('tradingDay =', s.tradingDay, '| sources.emBlocked =', s.sources?.emBlocked);
console.log('phase =', t?.phase);
console.log('indices =', t?.indices?.map((i) => `${i.name}:${i.price}(${i.pct}%)`).join('  '));
console.log('ztCount =', t?.ztCount, '| zb =', t?.zbCount, '| dt =', t?.dtCount, '| 炸板率 =', t?.zhaRate != null ? (t.zhaRate * 100).toFixed(0) + '%' : '-');
console.log('maxLianban =', t?.maxLianban, '| dist =', JSON.stringify(t?.lianbanDist), '| label =', t?.emotionLabel);
console.log('两市成交额 =', t?.amount2m != null ? (t.amount2m / 1e8).toFixed(0) + '亿' : '-', '| 涨/跌 =', t?.advancers ?? '-', '/', t?.decliners ?? '-');
console.log('volRankDegraded =', t?.volRankDegraded, '| sourceFallback =', t?.sourceFallback);
console.log('涨幅榜[0] =', JSON.stringify(t?.gainers?.[0] && { n: t.gainers[0].name, p: t.gainers[0].price, pct: t.gainers[0].pct, amt: t.gainers[0].amount }));
console.log('换手/量比榜[0] =', JSON.stringify(t?.volRatio?.[0] && { n: t.volRatio[0].name, vr: t.volRatio[0].volRatio, tr: t.volRatio[0].turnover }));
console.log('涨停池行数 =', s.pools?.zt?.length, '| 炸板池 =', s.pools?.zb?.length);

console.log('--- SSE ---');
const ac = new AbortController();
const res = await fetch('http://127.0.0.1:8000/api/stream', { signal: ac.signal });
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';
let frames = 0;
const timer = setTimeout(() => {
  console.log(frames >= 2 ? 'SSE OK（收到 ' + frames + ' 帧）' : 'SSE TIMEOUT frames=' + frames);
  process.exit(frames >= 2 ? 0 : 1);
}, 6000);
while (frames < 2) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let i;
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const chunk = buf.slice(0, i);
    buf = buf.slice(i + 2);
    const line = chunk.split('\n').find((l) => l.startsWith('data: '));
    if (line) {
      const d = JSON.parse(line.slice(6));
      frames++;
      console.log('[SSE]', d.type, d.type === 'tick' ? `indices=${d.payload?.indices?.length} zt=${d.payload?.ztCount}` : `zt行=${d.payload?.zt?.length}`);
    }
  }
}
