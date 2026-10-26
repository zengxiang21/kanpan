// 备选数据源连通性测试：新浪 vip 行情 / 新浪 hq / 腾讯 qt
const t = (tag, p, show) =>
  p.then((x) => console.log(`[${tag}] OK`, show ? String(x).slice(0, 200) : '')).catch((e) => console.log(`[${tag}] FAIL`, e.cause?.code || e.message));

const sinaHdr = { Referer: 'https://finance.sina.com.cn' };

t('push2-retest',
  fetch('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001&fields=f2,f12,f14', { signal: AbortSignal.timeout(8000) }).then((r) => r.text()),
  true);

t('sina-vip-涨幅榜',
  fetch('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=5&sort=changepercent&asc=0&node=hs_a&symbol=&_s_r_a=page', { headers: sinaHdr, signal: AbortSignal.timeout(8000) }).then((r) => r.text()),
  true);

t('sina-hq-指数',
  fetch('https://hq.sinajs.cn/list=s_sh000001,s_sz399001', { headers: sinaHdr, signal: AbortSignal.timeout(8000) })
    .then((r) => r.arrayBuffer()).then((b) => new TextDecoder('gbk').decode(b)),
  true);

t('tencent-快照',
  fetch('https://qt.gtimg.cn/q=s_sh000001,s_sz399001,sh600519', { signal: AbortSignal.timeout(8000) })
    .then((r) => r.arrayBuffer()).then((b) => new TextDecoder('gbk').decode(b)),
  true);
