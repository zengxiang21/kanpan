// 探测免费数据接口连通性与返回结构（东财公开行情接口）
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Referer: 'https://quote.eastmoney.com/' };
async function j(url, tag) {
  try {
    const t0 = Date.now();
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(12000) });
    const d = await r.json();
    const t = Date.now() - t0;
    if (tag === 'idx') {
      console.log('[idx] ok', t + 'ms', JSON.stringify(d.data?.diff?.[0]));
    } else if (tag === 'list') {
      console.log('[list] ok', t + 'ms', 'total=', d.data?.total, 'rows=', d.data?.diff?.length);
      console.log('[list] row0=', JSON.stringify(d.data?.diff?.[0]));
    } else if (tag === 'ztpool') {
      const p = d.data?.pool;
      console.log('[ztpool] ok', t + 'ms', 'count=', p?.length);
      if (p?.length) console.log('[ztpool] row0=', JSON.stringify(p[0]));
    }
  } catch (e) {
    console.log('[' + tag + '] FAIL:', e.message);
  }
}
const base = 'https://push2.eastmoney.com/api/qt';
await j(base + '/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006,1.000688&fields=f2,f3,f4,f6,f12,f14,f104,f105,f106', 'idx');
await j(base + '/clist/get?pn=1&pz=6000&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f10,f12,f14,f21,f100', 'list');
await j(base + '/clist/get?pn=1&pz=50&po=1&np=1&fltt=2&invt=2&fid=f10&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f10,f12,f14,f21,f100', 'list');
await j('https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=1000&sort=fbt%3Aasc&date=20261026', 'ztpool');
