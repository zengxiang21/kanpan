// 日K数据源测试：腾讯 ifzq / 新浪 kline
async function testTencent(code) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,20,qfq`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  const node = d.data?.[code];
  const bars = node?.qfqday || node?.day || [];
  console.log('[tencent', code + '] bars=', bars.length, 'last=', JSON.stringify(bars.at(-1)));
}
async function testSina(code) {
  const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${code}&scale=240&ma=no&datalen=20`;
  const r = await fetch(url, { headers: { Referer: 'https://finance.sina.com.cn' }, signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  console.log('[sina', code + '] bars=', d?.length, 'last=', JSON.stringify(d?.at(-1)));
}
for (const c of ['sh600519', 'sz301314']) {
  try { await testTencent(c); } catch (e) { console.log('[tencent', c + '] FAIL', e.cause?.code || e.message); }
  try { await testSina(c); } catch (e) { console.log('[sina', c + '] FAIL', e.cause?.code || e.message); }
}
