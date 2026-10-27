// 腾讯美股指数源测试（对比新浪 int_ 的延迟问题）
const s = new TextDecoder('gbk').decode(
  await (await fetch('https://qt.gtimg.cn/q=usIXIC,usDJI,usINX', { signal: AbortSignal.timeout(8000) })).arrayBuffer()
);
for (const m of s.matchAll(/v_us(\w+)="([^"]*)"/g)) {
  const f = m[2].split('~');
  console.log(m[1], f[1], 'price=', f[3], 'change=', f[31], 'pct=', f[32], 'time=', f[30]);
}
await new Promise((r) => setTimeout(r, 6000));
const s2 = new TextDecoder('gbk').decode(
  await (await fetch('https://qt.gtimg.cn/q=usIXIC', { signal: AbortSignal.timeout(8000) })).arrayBuffer()
);
const f2 = s2.split('=')[1].split('~');
console.log('6秒后 IXIC price=', f2[3]);
