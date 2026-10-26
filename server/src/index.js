// 短线看盘服务：行情聚合 + SSE 实时推送 + 静态托管前端构建产物
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, startScheduler, marketPhase, runSweep } from './state.js';
import { getQuotes, getNews, getGlobal, sourceStatus } from './em.js';
import { scanAll, reflowScan, auctionScan } from './scan.js';
import { historyState } from './history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8000;
const app = express();

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

// 竞价雷达（9:15-9:25 最有效）
app.get('/api/auction', (req, res) => {
  res.json({ ...auctionScan(state.marketSweep, state.pools), phase: marketPhase() });
});

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
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[kanpan] http://127.0.0.1:${PORT}`);
  startScheduler(broadcast);
});
