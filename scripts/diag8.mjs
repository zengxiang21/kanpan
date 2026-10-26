// 腾讯分时接口结构探测
const d = await (await fetch('https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=sh600519', { signal: AbortSignal.timeout(8000) })).json();
console.log('top keys:', Object.keys(d), '| d.data keys:', Object.keys(d.data || {}));
const node = d.data?.sh600519 || d.data?.data;
console.log('node keys:', node && Object.keys(node));
const dd = d.data?.sh600519?.data || {};
console.log('data keys:', Object.keys(dd));
if (dd.data) {
  console.log('rows=', dd.data.length, 'first=', JSON.stringify(dd.data[0]), 'last=', JSON.stringify(dd.data.at(-1)));
}
const qt = d.data?.sh600519?.qt;
if (qt) console.log('qt keys:', Object.keys(qt), '| 600519 昨收:', qt.sh600519?.[4]);
