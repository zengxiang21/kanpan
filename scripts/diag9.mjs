// 微博热搜 + 腾讯美股个股 测试
try {
  const d = await (await fetch('https://weibo.com/ajax/side/hotSearch', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) })).json();
  const list = d?.data?.realtime || [];
  console.log('[weibo] count=', list.length, 'top3=', list.slice(0, 3).map((x) => x.word + '(' + (x.raw_hot || x.num || 0) + ')').join(' | '));
} catch (e) { console.log('[weibo] FAIL', e.cause?.code || e.message); }
try {
  const t = new TextDecoder('gbk').decode(await (await fetch('https://qt.gtimg.cn/q=usNVAA.OQ,usNVDA.OQ,usTSLA.OQ,usAMD.OQ', { signal: AbortSignal.timeout(8000) })).arrayBuffer());
  console.log('[tencent us]', t.slice(0, 200));
} catch (e) { console.log('[tencent us] FAIL', e.cause?.code || e.message); }
