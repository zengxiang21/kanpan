// 直探 clist/ulist 当前真实返回形态
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Referer: 'https://quote.eastmoney.com/',
};

async function probe(tag, url) {
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(8000) });
    const txt = await r.text();
    console.log(`[${tag}] http=${r.status} len=${txt.length} head=`, txt.slice(0, 120));
    try {
      const d = JSON.parse(txt);
      console.log(`[${tag}] parsed: data?=${!!d.data} total=${d.data?.total} diffType=${Array.isArray(d.data?.diff) ? 'array' : typeof d.data?.diff} diffLen=${d.data?.diff?.length}`);
    } catch (e) {
      console.log(`[${tag}] JSON解析失败:`, e.message);
    }
  } catch (e) {
    console.log(`[${tag}] FAIL`, e.cause?.code || e.message);
  }
}

await probe('clist-f3', 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=50&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f12,f14');
await probe('ulist-idx', 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001&fields=f2,f3,f12,f14');
