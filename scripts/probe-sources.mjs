// 探测：百度热搜 / 东财经济数据日历 / 美债收益率
const H = { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' };

// 1) 百度热搜（wise 端 JSON）
try {
  const r = await fetch('https://top.baidu.com/api/board?platform=wise&tab=realtime', { headers: H, signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  const cards = d?.data?.cards || [];
  const items = cards.flatMap((c) => c.content || []).slice(0, 3);
  console.log('百度热搜 OK:', (d.data?.cards?.[0]?.content || []).length, '条 | 例:', items.map((x) => x.word).join('、'));
} catch (e) { console.log('百度热搜 FAIL', e.cause?.code || e.message); }

// 2) 东财经济数据日历（美国数据）
try {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_CALENDAR&columns=ALL&pageSize=5&source=WEB';
  const d = await (await fetch(url, { headers: { Referer: 'https://data.eastmoney.com/' }, signal: AbortSignal.timeout(8000) })).json();
  console.log('经济日历:', d.success ? 'OK ' + JSON.stringify(d.result?.data?.[0] || {}).slice(0, 150) : 'success=false ' + d.message);
} catch (e) { console.log('经济日历 FAIL', e.cause?.code || e.message); }

// 3) 美债收益率（新浪 hf_TNX / 腾讯）
try {
  const s = new TextDecoder('gbk').decode(await (await fetch('https://hq.sinajs.cn/list=hf_TNX,gb_us10ytmir', { headers: H, signal: AbortSignal.timeout(8000) })).arrayBuffer());
  console.log('新浪美债:', s.slice(0, 180));
} catch (e) { console.log('新浪美债 FAIL', e.message); }
