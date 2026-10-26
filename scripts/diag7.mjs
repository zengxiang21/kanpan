// 外围指数源测试：新浪 int_ 全局指数 + 新浪滚动快讯
const H = { Referer: 'https://finance.sina.com.cn' };
try {
  const txt = new TextDecoder('gbk').decode(await (await fetch('https://hq.sinajs.cn/list=int_dji,int_nasdaq,int_sp500,int_hangseng,int_nikkei,hf_CHA50CFD', { headers: H, signal: AbortSignal.timeout(8000) })).arrayBuffer());
  console.log('[sina int]\n' + txt.slice(0, 400));
} catch (e) { console.log('[sina int] FAIL', e.cause?.code || e.message); }
try {
  const d = await (await fetch('https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&num=5&page=1', { headers: H, signal: AbortSignal.timeout(8000) })).json();
  const items = d?.result?.data || [];
  console.log('[sina news] count=', items.length, 'first=', items[0] && (items[0].title + ' | ' + items[0].ctime));
} catch (e) { console.log('[sina news] FAIL', e.cause?.code || e.message); }
