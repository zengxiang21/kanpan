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
  try {
    fs.mkdirSync(DIR, { recursive: true });
    historyState.meta.count = Object.keys(historyState.bars).length;
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ meta: historyState.meta, bars: historyState.bars }));
    fs.renameSync(tmp, FILE); // 原子写入：进程被杀也不会产生半个损坏文件
  } catch (e) {
    console.error('[history] 落盘失败', e.message);
  }
}

function txCode(code) {
  return (/^(6|9)/.test(code) ? 'sh' : 'sz') + code;
}

async function fetchKlineTencent2(code, bars) {
  const c = txCode(code);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${c},day,,,${bars},qfq`;
  const d = JSON.parse(await fetchGBK(url, {}, 9000));
  const node = d?.data?.[c];
  const raw = node?.qfqday || node?.day;
  if (!Array.isArray(raw) || !raw.length) throw new Error('空K线');
  return raw.map((b) => [b[0], +b[1], +b[2], +b[3], +b[4], Math.round(+b[5] * 100)]);
}

async function fetchKlineSina2(code, bars) {
  const c = txCode(code);
  const d = JSON.parse(await fetchGBK(`https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${c}&scale=240&ma=no&datalen=${bars}`, { Referer: 'https://finance.sina.com.cn/' }, 9000));
  if (!Array.isArray(d) || !d.length) throw new Error('空K线');
  return d.map((b) => [b.day, +b.open, +b.close, +b.high, +b.low, +b.volume]);
}

// 腾讯熔断：连续失败即切新浪（反爬触发时避免逐只等待超时）
const breaker = { txFails: 0, txDownUntil: 0 };

// 按需取单只日K（个股详情页用）：本地历史库优先 → 腾讯 → 新浪
export async function getKline(code, bars = 80) {
  const mine = historyState.bars[code];
  if (mine && mine.length >= Math.min(30, bars)) return mine.slice(-bars);
  if (Date.now() < breaker.txDownUntil) return fetchKlineSina2(code, bars);
  try {
    const r = await fetchKlineTencent2(code, bars);
    breaker.txFails = 0;
    return r;
  } catch (e) {
    breaker.txFails++;
    if (breaker.txFails >= 3) {
      breaker.txDownUntil = Date.now() + 30 * 60_000;
      console.warn('[history] 腾讯K线熔断 30 分钟 → 切新浪:', e.message);
    }
    return fetchKlineSina2(code, bars);
  }
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
    const mine = historyState.bars[code];
    if (lastDate && mine && mine.length && mine.at(-1)[0] === lastDate) {
      ok++; // 已是最新，增量跳过
      continue;
    }
    if (!lastDate && mine && mine.length >= BARS - 5) {
      ok++; // 断点续传：中断后重启，已有完整历史的不再重拉
      continue;
    }
    try {
      if (Date.now() < breaker.txDownUntil) throw new Error('tx熔断中');
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
