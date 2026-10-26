// 全市场日线历史库：腾讯 ifzq 日K(主) + 新浪(备)，JSON 落盘，每日增量
// 供形态扫描器计算均线/量能/强势基因
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchGBK } from './em.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'data', 'history');
const FILE = path.join(DIR, 'kline.json');
const BARS = 80; // 每只保留 80 根日K

export const historyState = {
  bars: {},        // code -> [[date, open, close, high, low, vol股], ...]
  meta: { updatedAt: null, lastBarDate: null, count: 0 },
  progress: { running: false, done: 0, total: 0, ok: 0, fail: 0 },
  loaded: false,
};

export function loadHistory() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    historyState.bars = raw.bars || {};
    historyState.meta = raw.meta || historyState.meta;
    historyState.loaded = true;
    console.log('[history] 载入', Object.keys(historyState.bars).length, '只 · 最新bar', historyState.meta.lastBarDate);
  } catch {
    console.log('[history] 无历史文件，待首次下载');
  }
}

function saveHistory() {
  fs.mkdirSync(DIR, { recursive: true });
  historyState.meta.count = Object.keys(historyState.bars).length;
  fs.writeFileSync(FILE, JSON.stringify({ meta: historyState.meta, bars: historyState.bars }));
}

function txCode(code) {
  return (/^(6|9)/.test(code) ? 'sh' : 'sz') + code;
}

async function fetchKlineTencent(code) {
  const c = txCode(code);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${c},day,,,${BARS},qfq`;
  const d = JSON.parse(await fetchGBK(url, {}, 9000));
  const node = d?.data?.[c];
  const raw = node?.qfqday || node?.day;
  if (!Array.isArray(raw) || !raw.length) throw new Error('空K线');
  return raw.map((b) => [b[0], +b[1], +b[2], +b[3], +b[4], Math.round(+b[5] * 100)]);
}

async function fetchKlineSina(code) {
  const c = txCode(code);
  const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${c}&scale=240&ma=no&datalen=${BARS}`;
  const d = JSON.parse(await fetchGBK(url, { Referer: 'https://finance.sina.com.cn/' }, 9000));
  if (!Array.isArray(d) || !d.length) throw new Error('空K线');
  return d.map((b) => [b.day, +b.open, +b.close, +b.high, +b.low, +b.volume]);
}

// 下载/更新一批股票；todayFilter: 已有该日期最新bar的股票跳过（增量）
async function downloadBatch(codes, lastDate, delayMs) {
  let ok = 0, fail = 0;
  for (const code of codes) {
    if (lastDate) {
      const mine = historyState.bars[code];
      if (mine && mine.length && mine.at(-1)[0] === lastDate) {
        ok++;
        continue;
      }
    }
    try {
      historyState.bars[code] = await fetchKlineTencent(code);
      ok++;
    } catch {
      try {
        historyState.bars[code] = await fetchKlineSina(code);
        ok++;
      } catch {
        fail++;
      }
    }
    historyState.progress.done++;
    if (ok % 200 === 0) saveHistory(); // 阶段性落盘
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  historyState.progress.ok += ok;
  historyState.progress.fail += fail;
  return { ok, fail };
}

// 用全市场股票清单触发全量/增量更新（清单来自备源全市场扫描）
let started = false;
export function ensureHistoryStarted(getCodes) {
  if (started) return;
  started = true;
  (async () => {
    // 等待全市场扫描给出股票清单
    let codes = null;
    for (let i = 0; i < 120 && !codes; i++) {
      codes = getCodes();
      if (!codes) await new Promise((r) => setTimeout(r, 5000));
    }
    if (!codes) {
      console.error('[history] 拿不到全市场清单，放弃');
      return;
    }
    historyState.progress = { running: true, done: 0, total: codes.length, ok: 0, fail: 0 };
    console.log('[history] 开始下载/更新', codes.length, '只日线…');
    const p = historyState.progress;
    const CHUNK = 500;
    for (let i = 0; i < codes.length; i += CHUNK) {
      const lastDate = historyState.meta.lastBarDate;
      await downloadBatch(codes.slice(i, i + CHUNK), lastDate, 0);
      console.log(`[history] ${p.done}/${p.total} ok=${p.ok} fail=${p.fail}`);
    }
    const dates = Object.values(historyState.bars).map((b) => (b.length ? b.at(-1)[0] : '')).sort();
    historyState.meta.lastBarDate = dates.at(-1) || null;
    historyState.meta.updatedAt = Date.now();
    saveHistory();
    p.running = false;
    console.log('[history] 完成 · 最新bar', historyState.meta.lastBarDate, '· 覆盖', historyState.meta.count, '只');
  })();
}

// 收盘后补当日bar（供调度器调用）
export function ensureHistoryFresh(getCodes) {
  if (!historyState.loaded && !Object.keys(historyState.bars).length) return;
  if (historyState.progress.running) return;
  ensureHistoryStarted(getCodes);
}
