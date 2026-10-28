// 短线看盘服务：行情聚合 + SSE 实时推送 + 静态托管前端构建产物
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, startScheduler, marketPhase, runSweep } from './state.js';
import { getQuotes, getNews, getGlobal, getMinute, getUSStocks, getSentiment, getSectorBoard, getLHBCodes, getEarningsForecast, getArticle, sourceStatus } from './em.js';
import { saveAuctionSnapshot, getAuctionByDate, listAuctionDates, updateAuctionCloses } from './auctionstore.js';
import { scanAll, reflowScan, auctionScan } from './scan.js';
import { historyState, getKline } from './history.js';
import { buildReview, saveReviewIfNeeded, latestSavedReview, buildPlans, reviewDates, reviewByDate } from './review.js';
import { runBacktest } from './backtest.js';
import { peersAnalysis } from './peers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8000;
const app = express();

// 未捕获异常兜底：打印并存活，绝不静默死亡
process.on('uncaughtException', (e) => console.error(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] [uncaught]`, e.message, (e.stack || '').split('\n')[1] || ''));
process.on('unhandledRejection', (e) => console.error(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] [unhandledRejection]`, String(e).slice(0, 200)));

// ---------- SSE 客户端管理 ----------
const clients = new Set();

function broadcast(type, payload) {
  const msg = `event: data\ndata: ${JSON.stringify({ type, payload })}\n\n`;
  for (const res of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(res);
    }
  }
}

// ---------- API ----------
app.get('/api/debug', (req, res) => {
  const handles = {};
  for (const h of process._getActiveHandles()) handles[h.constructor.name] = (handles[h.constructor.name] || 0) + 1;
  res.json({ handles, memoryMB: Math.round(process.memoryUsage().rss / 1e6), stats: state.stats || null, clients: clients.size });
});

app.get('/api/health', (req, res) => res.json({ ok: true, updatedAt: state.updatedAt, tradingDay: state.tradingDay, sources: sourceStatus() }));

app.get('/api/snapshot', (req, res) =>
  res.json({ tick: state.tick, pools: state.pools, tradingDay: state.tradingDay, updatedAt: state.updatedAt, sources: sourceStatus() })
);

app.get('/api/pools', (req, res) => res.json(state.pools));

app.get('/api/quotes', async (req, res) => {
  const codes = String(req.query.codes || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 80);
  try {
    res.json(await getQuotes(codes));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 形态选股（放量突破/缩量回踩）+ 龙头回流预期
app.get('/api/scan', (req, res) => {
  const sweep = state.marketSweep;
  const base = scanAll(sweep);
  res.json({
    ...base,
    reflow: reflowScan(sweep, state.pools),
    phase: marketPhase(),
  });
});

// 竞价雷达（9:15-9:25 真实竞价；其余为预演；9:25 定稿存档，收盘回填复盘）
const lhbCache = { date: null, codes: [] };
app.get('/api/auction', async (req, res) => {
  const date = String(req.query.date || '');
  if (/^\d{8}$/.test(date)) {
    return res.json(getAuctionByDate(date) || { mode: 'archive', rows: [], directions: [], note: '该日无竞价存档' });
  }
  const phase = marketPhase();
  const lhbDate = state.pools.prevDate;
  if (lhbDate && lhbCache.date !== lhbDate) {
    try {
      lhbCache.codes = await getLHBCodes(lhbDate);
      lhbCache.date = lhbDate;
      console.log('[lhb] 昨日龙虎榜', lhbDate, '·', lhbCache.codes.length, '只');
    } catch { /* 失败用空集，下轮重试 */ }
  }
  const result = await auctionScan(state.marketSweep, state.pools, phase, { lhbCodes: new Set(lhbCache.codes), lhbDate });
  if ((phase === 'auction_end' || phase === 'open') && state.tradingDay) {
    saveAuctionSnapshot(state.tradingDay, {
      date: state.tradingDay, savedAt: Date.now(), mode: result.mode,
      lhbDate, rows: result.rows.map((r) => ({ ...r })), directions: result.directions,
    });
  }
  res.json(result);
});

// 板块内对比：同行业排名 + 能不能买评价
app.get('/api/peers', (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!/^[0-9]{6}$/.test(code)) return res.status(400).json({ error: 'bad code' });
  res.json(peersAnalysis(code, state.marketSweep, state.pools, state.tick));
});

// 业绩预告（即将披露 + 近期已披露，含超预期判断）
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

// 竞价存档日期列表
app.get('/api/auction/dates', (req, res) => res.json(listAuctionDates()));

// 隔夜外围
app.get('/api/global', async (req, res) => {
  try {
    res.json(await getGlobal());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 7×24 快讯
app.get('/api/news', async (req, res) => {
  try {
    res.json(await getNews(30));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 分时图（腾讯源）
app.get('/api/minute', async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'bad code' });
  try {
    res.json(await getMinute(code));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 日K线（个股详情页）：本地历史库优先，缺了现拉腾讯
app.get('/api/kline', async (req, res) => {
  const code = String(req.query.code || '').trim();
  const limit = Math.min(120, Math.max(20, parseInt(req.query.limit, 10) || 80));
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'bad code' });
  try {
    res.json({ code, bars: await getKline(code, limit) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 收盘复盘 + 明日应对（实时生成；收盘后自动落盘 data/review/）
app.get('/api/review', (req, res) => {
  res.json(buildReview(state, marketPhase()));
});

// 上一份已落盘的复盘
app.get('/api/review/saved', (req, res) => res.json(latestSavedReview()));

// 交易计划：关注股的竞价应对表
app.get('/api/plan', async (req, res) => {
  const codes = String(req.query.codes || '').split(',').map((s) => s.trim()).filter((c) => /^\d{6}$/.test(c)).slice(0, 8);
  try {
    res.json(await buildPlans(codes, state));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 板块轮动（新浪行业板块实时涨跌 + 领涨股）
app.get('/api/sectors', async (req, res) => {
  try {
    res.json(await getSectorBoard());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 美股明星股（隔夜方向）
app.get('/api/us', async (req, res) => {
  try {
    res.json(await getUSStocks());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 舆论热度（快讯 × 题材词典词频）
app.get('/api/sentiment', async (req, res) => {
  try {
    res.json(await getSentiment());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 历史复盘日期列表
app.get('/api/review/dates', (req, res) => {
  res.json(reviewDates());
});

// 读取指定日期的已存复盘
app.get('/api/review/bydate', (req, res) => {
  const date = String(req.query.date || '');
  res.json(reviewByDate(date));
});

// 策略回测（本地历史库重放）
app.get('/api/backtest', (req, res) => {
  try {
    res.json(runBacktest());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 历史库状态
app.get('/api/history/status', (req, res) => {
  res.json({
    ready: historyState.meta.count > 0,
    count: historyState.meta.count,
    lastBarDate: historyState.meta.lastBarDate,
    updatedAt: historyState.meta.updatedAt,
    progress: historyState.progress,
  });
});

app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');
  clients.add(res);
  if (state.tick) res.write(`event: data\ndata: ${JSON.stringify({ type: 'tick', payload: state.tick })}\n\n`);
  if (state.pools) res.write(`event: data\ndata: ${JSON.stringify({ type: 'pools', payload: state.pools })}\n\n`);
  req.on('close', () => clients.delete(res));
});

// SSE 心跳，防止代理层断开
setInterval(() => {
  for (const res of clients) {
    try {
      res.write(': hb\n\n');
    } catch {
      clients.delete(res);
    }
  }
}, 15000).unref();

// ---------- 静态托管前端构建产物 ----------
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(webDist));
// 云端数据文件兜底
app.use('/cloud', express.static(path.join(__dirname, '..', '..', 'docs', 'cloud')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[kanpan] http://127.0.0.1:${PORT}`);
  startScheduler(broadcast);
});
