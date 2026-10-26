// 诊断 push2 接口：并发 vs 串行，打印底层错误 cause
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Referer: 'https://quote.eastmoney.com/',
};
const base = 'https://push2.eastmoney.com/api/qt';
const urls = {
  idx: base + '/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006,1.000688&fields=f2,f3,f4,f6,f12,f14,f104,f105,f106',
  gain: base + '/clist/get?pn=1&pz=50&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f12,f14',
  vr: base + '/clist/get?pn=1&pz=50&po=1&np=1&fltt=2&invt=2&fid=f10&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f12,f14',
  amt: base + '/clist/get?pn=1&pz=50&po=1&np=1&fltt=2&invt=2&fid=f6&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f12,f14',
};

async function tryFetch(tag, url) {
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    console.log(`[${tag}] OK rows=${d?.data?.diff?.length ?? '?'}`);
    return true;
  } catch (e) {
    const c = e.cause || {};
    console.log(`[${tag}] FAIL ${e.message} | cause=${c.code || ''} ${c.message || ''} ${c.errno || ''}`);
    return false;
  }
}

console.log('--- 并发 4 个 ---');
await Promise.all(Object.entries(urls).map(([k, u]) => tryFetch(k, u)));

console.log('--- 串行 ---');
for (const [k, u] of Object.entries(urls)) await tryFetch(k, u);

console.log('--- 再并发一次（看是否第一次必挂） ---');
await Promise.all(Object.entries(urls).map(([k, u]) => tryFetch(k, u)));
