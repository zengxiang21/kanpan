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
import { getPlanCache, buildPlansWithTimeout, refreshPlanCache } from './plancache.js';
import { industryOf } from './industries.js';
import { buildHeatmap } from './heatmap.js';
import { buildLeaderPool } from './leaderpool.js';
import { buildMacroCalendar } from './macro.js';
import { todayEvents, anomalyDates, buildAnomalyReview, dayOf } from './anomaly.js';
import { buildPlaybook } from './playbook.js';
import { getUser, saveUser } from './userstore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8000;
const app = express();
app.use(express.json());

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
const auctionCache = { at: 0, data: null };
const earnCache = { at: 0, data: null };
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
  if (Date.now() - auctionCache.at > 10_000 || !auctionCache.data) {
    auctionCache.data = await auctionScan(state.marketSweep, state.pools, phase, { lhbCodes: new Set(lhbCache.codes), lhbDate }).catch(() => auctionCache.data);
    auctionCache.at = Date.now();
  }
  const result = auctionCache.data;
  // 同步给 plan 推荐用：竞价方向强度加成依赖它（此前只存在模块局部变量里，加成恒为 0）
  state.auctionCache = result;
  if ((phase === 'auction_end' || phase === 'open') && state.tradingDay) {
    saveAuctionSnapshot(state.tradingDay, {
      date: state.tradingDay, savedAt: Date.now(), mode: result.mode,
      lhbDate, rows: result.rows.map((r) => ({ ...r })), directions: result.directions,
    });
  }
  res.json(result);
});

// 大盘云图：全市场按行业分格的涨跌热力图（基于本地全市场快照，无额外请求）
app.get('/api/heatmap', (req, res) => {
  const hm = buildHeatmap(state.marketSweep, state.pools);
  if (!hm) return res.json({ groups: [], meta: { total: 0, industries: 0, updatedAt: null, note: '等待全市场快照' } });
  res.json(hm);
});

// 美国经济数据日历（C4）：官方固定规律推算，无免费结构化源
app.get('/api/macro', (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  res.json(buildMacroCalendar(days));
});

// 异动监控：当日实时事件（服务端全市场帧对比，持久化）
app.get('/api/anomaly/today', (req, res) => {
  const events = todayEvents();
  // 用服务端 dayOf 口径推日期，避免 UTC toISOString 在凌晨算出前一天
  const day = events.length ? dayOf(events[events.length - 1].t) : dayOf();
  res.json({ date: day, count: events.length, events: events.slice(-300).reverse() });
});

// 异动记录日期列表（倒序，供复盘选择）
app.get('/api/anomaly/dates', (req, res) => res.json(anomalyDates()));

// 某日异动复盘（聚合统计 + 次日参考）
app.get('/api/anomaly/review', (req, res) => {
  const date = String(req.query.date || '');
  if (!/^\d{8}$/.test(date)) return res.status(400).json({ error: 'bad date, want yyyyMMdd' });
  res.json(buildAnomalyReview(date));
});

// 开盘前操作手册：昨日复盘 + 今日竞价实况 + 大盘环境 → 场景化操作方案
app.get('/api/playbook', async (req, res) => {
  try {
    // 复用 /api/auction 的同一份缓存逻辑，保证手册与竞价雷达口径一致
    const phase = marketPhase();
    const lhbDate = state.pools.prevDate;
    if (lhbDate && lhbCache.date !== lhbDate) {
      try { lhbCache.codes = await getLHBCodes(lhbDate); lhbCache.date = lhbDate; } catch { /* 用空集 */ }
    }
    if (Date.now() - auctionCache.at > 10_000 || !auctionCache.data) {
      auctionCache.data = await auctionScan(state.marketSweep, state.pools, phase, { lhbCodes: new Set(lhbCache.codes), lhbDate }).catch(() => auctionCache.data);
      auctionCache.at = Date.now();
    }
    res.json(buildPlaybook(state, auctionCache.data));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 龙头分层动态池（总龙头/龙二/分支龙头 + 进出状态）
app.get('/api/leaders', (req, res) => {
  res.json(buildLeaderPool(state.pools, state.tradingDay));
});

// 板块内对比：同行业排名 + 能不能买评价
app.get('/api/peers', (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!/^[0-9]{6}$/.test(code)) return res.status(400).json({ error: 'bad code' });
  res.json(peersAnalysis(code, state.marketSweep, state.pools, state.tick));
});

// 用户数据：自选/计划/日志（跨设备共享）
app.get('/api/user', (req, res) => res.json(getUser()));
app.post('/api/user', (req, res) => {
  try {
    res.json(saveUser(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 业绩预告（即将披露 + 近期已披露，含超预期判断）
app.get('/api/earnings', async (req, res) => {
  try {
    if (Date.now() - earnCache.at > 10 * 60_000 || !earnCache.data) {
      earnCache.data = await getEarningsForecast(parseInt(req.query.days, 10) || 3).catch(() => earnCache.data || []);
      earnCache.at = Date.now();
    }
    res.json(earnCache.data);
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

// 交易计划：系统自动推荐 3 只（空间板龙头/回流/放量/回踩）或指定关注股
app.get('/api/plan', async (req, res) => {
  const codes = String(req.query.codes || '').split(',').map((x) => x.trim()).filter((c) => /^\d{6}$/.test(c)).slice(0, 6);
  try {
    const plans = codes.length ? await buildPlansWithTimeout(codes, state) : (getPlanCache()?.plans || []);
    res.json({ auto: !codes.length, plans });
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

// ---------- 交易计划自动推荐缓存（此前 refreshPlanCache 从未被调用，/api/plan 恒返回空） ----------
async function refreshPlans() {
  try {
    await refreshPlanCache(state);
  } catch (e) {
    console.error('[plan]', e.message);
  }
}
setInterval(refreshPlans, 60_000);

// ---------- 诊断：手动触发交易计划计算 ----------
app.get('/api/debug/plan', async (req, res) => {
  const t0 = Date.now();
  try {
    const { buildAutoPlans } = await import('./plancache.js');
    const r = await buildAutoPlans(state);
    res.json({
      ok: true, ms: Date.now() - t0,
      tickNull: state.tick == null, sweepNull: state.marketSweep == null,
      sweepRows: state.marketSweep?.rows?.length ?? 0,
      ztCount: state.pools.zt.length,
      plans: (r.plans || []).map((p) => ({ code: p.code, name: p.name, stage: p.stage, from: p.from })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, ms: Date.now() - t0, error: e.message, stack: String(e.stack).split('\n').slice(0, 5) });
  }
});

// ---------- 诊断：手动触发收盘复盘落盘 ----------
app.get('/api/debug/savereview', (req, res) => {
  try {
    const before = reviewDates().length;
    saveReviewIfNeeded(state, marketPhase());
    const after = reviewDates().length;
    res.json({
      ok: true, phase: marketPhase(), before, after,
      tickNull: state.tick == null,
      ztCount: state.tick?.ztCount ?? null,
      indicesLen: state.tick?.indices?.length ?? 0,
      tradingDay: state.tradingDay,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[kanpan] http://127.0.0.1:${PORT}`);
  startScheduler(broadcast);
  // 首帧行情就绪后立刻算一次推荐，不用等 60 秒
  setTimeout(refreshPlans, 20_000);
});
