// 字段细节确认：新浪 vip 行情完整行 + 量比排序 + 腾讯完整行索引 + push2his
const sinaHdr = { Referer: 'https://finance.sina.com.cn' };

const full = await (
  await fetch('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=2&sort=changepercent&asc=0&node=hs_a&symbol=&_s_r_a=page', { headers: sinaHdr, signal: AbortSignal.timeout(8000) })
).text();
console.log('[sina 完整行]\n', full.slice(0, 700));

try {
  const vr = await (
    await fetch('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=3&sort=volumeratio&asc=0&node=hs_a&symbol=&_s_r_a=page', { headers: sinaHdr, signal: AbortSignal.timeout(8000) })
  ).text();
  console.log('\n[sina 量比排序] OK\n', vr.slice(0, 300));
} catch (e) {
  console.log('[sina 量比排序] FAIL', e.cause?.code || e.message);
}

const tx = new TextDecoder('gbk').decode(
  await (await fetch('https://qt.gtimg.cn/q=sh600519', { signal: AbortSignal.timeout(8000) })).arrayBuffer()
);
const f = tx.split('=')[1]?.replace(/"/g, '').split('~') || [];
console.log('\n[腾讯字段] price=', f[3], 'prevClose=', f[4], 'pct=', f[32], 'high=', f[33], 'low=', f[34], 'amount=', f[37], 'turnover=', f[38], '量比[49]=', f[49], 'floatCap[44]=', f[44], 'totalCap[45]=', f[45]);

try {
  const his = await (
    await fetch('https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600519&klt=101&fqt=1&lmt=5&end=20500101&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57', { signal: AbortSignal.timeout(8000) })
  ).text();
  console.log('\n[push2his K线] OK', his.slice(0, 150));
} catch (e) {
  console.log('\n[push2his K线] FAIL', e.cause?.code || e.message);
}
