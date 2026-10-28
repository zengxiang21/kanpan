// 补丁批次1：业绩预告接口 + 龙虎榜扩展 + 文章代理 + 溢价语义修正
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// --- em.js: getEarningsForecast ---
{
  const p = root + 'server/src/em.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('getEarningsForecast')) {
    s += `

// ================= 业绩预告（东财数据中心：未来 N 天即将披露 + 近 4 天已披露） =================
export async function getEarningsForecast(days = 3) {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - 4 * 86400000);
  const to = new Date(today.getTime() + days * 86400000);
  const url =
    'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_PUBLIC_OP_NEWPREDICT' +
    '&columns=SECURITY_CODE,SECURITY_NAME_ABBR,NOTICE_DATE,PREDICT_TYPE,ADD_AMP_UPPER,ADD_AMP_LOWER,PREDICT_CONTENT' +
    \`&filter=(NOTICE_DATE%3E%3D%27\${fmt(from)}%27)(NOTICE_DATE%3C%3D%27\${fmt(to)}%27)&pageSize=500&source=WEB\`;
  const d = JSON.parse(await fetchText(url, HEADERS_EM, 10000));
  return (d?.result?.data || []).map((x) => ({
    code: String(x.SECURITY_CODE), name: x.SECURITY_NAME_ABBR,
    noticeDate: String(x.NOTICE_DATE || '').slice(0, 10),
    type: x.PREDICT_TYPE || '',
    addUpper: x.ADD_AMP_UPPER != null ? +x.ADD_AMP_UPPER : null,
    addLower: x.ADD_AMP_LOWER != null ? +x.ADD_AMP_LOWER : null,
    content: String(x.PREDICT_CONTENT || '').slice(0, 120),
    superExpect: (x.ADD_AMP_UPPER != null && x.ADD_AMP_UPPER >= 30) || /预增|扭亏|大增/.test(x.PREDICT_TYPE || ''),
  }));
}

// ================= 文章正文代理（白名单域名，本站内阅读） =================
const ARTICLE_HOSTS = ['xueqiu.com', 'douban.com', '163.com', 'zhihu.com', 'jiemian.com', 'wallstreetcn.com', 'sina.com.cn', 'eastmoney.com'];
export async function getArticle(url) {
  const u = new URL(url);
  if (!ARTICLE_HOSTS.some((h) => u.hostname.endsWith(h))) throw new Error('域名不在白名单');
  const html = await fetchText(url, { 'User-Agent': HEADERS_EM['User-Agent'], Referer: 'https://www.sina.com.cn/' }, 12000);
  return html;
}
`;
    fs.writeFileSync(p, s);
    console.log('em.js: earnings + article OK');
  }
}

// --- index.js: 新路由 ---
{
  const p = root + 'server/src/index.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('/api/earnings')) {
    s = s.replace(
      "import { getQuotes, getNews, getGlobal, getMinute, getUSStocks, getSentiment, getSectorBoard, getLHBCodes, sourceStatus } from './em.js';",
      "import { getQuotes, getNews, getGlobal, getMinute, getUSStocks, getSentiment, getSectorBoard, getLHBCodes, getEarningsForecast, getArticle, sourceStatus } from './em.js';"
    );
    s = s.replace(
      "// 竞价存档日期列表",
      `// 业绩预告（即将披露 + 近期已披露，含超预期判断）
app.get('/api/earnings', async (req, res) => {
  try {
    res.json(await getEarningsForecast(parseInt(req.query.days, 10) || 3));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 文章正文代理（白名单）
app.get('/api/article', async (req, res) => {
  try {
    const html = await getArticle(String(req.query.url || ''));
    res.type('text/plain').send(html);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 龙虎榜代码列表（昨日）
app.get('/api/lhb', async (req, res) => {
  const date = state.pools.prevDate || state.tradingDay;
  try {
    res.json({ date, codes: await getLHBCodes(date) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 竞价存档日期列表`
    );
    fs.writeFileSync(p, s);
    console.log('index.js: 路由 OK');
  }
}

// --- scan.js: auctionScan 行增加业绩标签 ---
{
  const p = root + 'server/src/scan.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('earnMap')) {
    s = s.replace(
      "import { industryOf } from './industries.js';",
      "import { industryOf } from './industries.js';\nimport { getEarningsForecast } from './em.js';"
    );
    s = s.replace(
      "export function auctionScan(sweepRows, pools, phase, extras = {}) {",
      "export async function auctionScan(sweepRows, pools, phase, extras = {}) {\n  let earnMap = new Map();\n  try { const earn = await getEarningsForecast(3); for (const e of earn) earnMap.set(e.code, e); } catch { /* 可选数据 */ }"
    );
    s = s.replace(
      "    empty.rows.push({ ...row(s, Math.min(99, Math.round(score)), null, reasons), direction, amount: s.amount,\n      gap: s.pct,               // 竞价涨幅（预演=昨日涨幅）\n      lianban: lianbanPrev,",
      "    const earn = earnMap.get(s.code);\n    if (earn && earn.superExpect) reasons.push('业绩超预期候选');\n    empty.rows.push({ ...row(s, Math.min(99, Math.round(score)), null, reasons), direction, amount: s.amount,\n      gap: s.pct,               // 竞价涨幅（预演=昨日涨幅）\n      earn: earn ? { type: earn.type, add: earn.addUpper, date: earn.noticeDate, superExpect: earn.superExpect } : null,\n      lianban: lianbanPrev,"
    );
    fs.writeFileSync(p, s);
    console.log('scan.js: 业绩标签 OK');
  }
}
console.log('批次1补丁完成');
