// 美股大公司财报日历（对 A 股盘前决策有映射意义的那批）
//
// 数据源：SEC EDGAR —— https://data.sec.gov/submissions/CIK{10位}.json
//   官方、免费、无需 API key。实测可用（2026-10-29）。
//   为什么能精确识别财报：返回的 filings.recent.items 字段里含 "2.02" 的 8-K
//   就是 Item 2.02 "Results of Operations and Financial Condition"，即发财报当天
//   提交的公告。其他 8-K（高管变动 5.02、股东大会 5.07、签约 1.01）能被排除。
//
// 调研过的其他源全部失败（与 macro.js 注释里的结论一致）：
//   Nasdaq api / Yahoo 403 / Zacks Incapsula / TipRanks 403 / MarketBeat 403 /
//   FMP 401(需key) / 东财 4 个报表名"报表配置不存在" / 雪球 400 / 富途 404 / WSJ 连不上
//   韩国 DART opendart.fss.or.kr → 需 인증키（010 未注册key）
//
// 重要限制，UI 上必须对用户讲清楚：
//   1) 财报日期由公司自行决定，没有固定发布规则（不像 FOMC 有官网日程、
//      CPI 有 BLS 固定发布日）。EDGAR 只能拿到"已发生"的申报日。
//      这里的日期全部是「按历史同期推算的窗口」，可能偏差 1-3 天。
//   2) 台积电 TSM 无法自动化：外国私人发行人提交的 6-K 的 items 字段是空数组，
//      无法区分哪份是财报。
//   3) 三星电子 / SK 海力士无法自动化：不向 SEC 提交任何文件，
//      只能走韩国 DART（需 API key）。要覆盖需人工维护静态表。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '..', 'data', 'earnings-edgar.json');
const CACHE_TTL = 24 * 3600 * 1000;
const UA = { 'User-Agent': 'kanpan earnings-calendar research' };

// fye = 财年结束月日（MMDD）。财季末由它往前推 0/3/6/9 个月得到。
// chain = 产业链定位，aShare = 对 A 股的映射方向（盘前真正要看的东西）
const COMPANIES = [
  { ticker: 'NVDA', cik: '0001045810', name: '英伟达', fye: '0131', chain: 'AI 算力芯片', aShare: '算力/光模块/PCB/液冷/电源', weight: 3 },
  { ticker: 'AAPL', cik: '0000320193', name: '苹果', fye: '0926', chain: '消费电子', aShare: '苹果链/消费电子/组装', weight: 3 },
  { ticker: 'AMZN', cik: '0001018724', name: '亚马逊', fye: '1231', chain: '云计算/电商', aShare: '跨境电商/物流/AWS链', weight: 3 },
  { ticker: 'AMD', cik: '0000002488', name: 'AMD', fye: '1226', chain: '半导体设计', aShare: '半导体设计/信创', weight: 2 },
  { ticker: 'AVGO', cik: '0001730168', name: '博通', fye: '1101', chain: '网络芯片/ASIC', aShare: '网络芯片/ASIC/光模块', weight: 2 },
  { ticker: 'INTC', cik: '0000050863', name: '英特尔', fye: '1227', chain: 'CPU/代工', aShare: '半导体设备/材料', weight: 2 },
  { ticker: 'MSFT', cik: '0000789019', name: '微软', fye: '0630', chain: '云计算/软件', aShare: '云计算/软件/SaaS', weight: 1 },
  { ticker: 'GOOGL', cik: '0001652044', name: '谷歌', fye: '1231', chain: '广告/AI', aShare: '广告/AI应用/光模块', weight: 1 },
  { ticker: 'META', cik: '0001326801', name: 'Meta', fye: '1231', chain: '社交广告/ARVR', aShare: 'ARVR/广告', weight: 1 },
  { ticker: 'TSLA', cik: '0001318605', name: '特斯拉', fye: '1231', chain: '新能源车', aShare: '新能源车/一体化压铸', weight: 1 },
];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 北京时间当天的 UTC 日期对象 */
function bjToday() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  return new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()));
}

const monthEnd = (y, m) => new Date(Date.UTC(y, m, 0)); // m 为 1-12

// 财年结束日在月末附近但未必是当月最后一天（如 AVGO 是 11-01、MSFT 是 06-30），
// 若 d 超过该月天数则回落到月末，避免 Date 溢出到下一月。
function clampQuarterEnd(y, m, d) {
  const last = monthEnd(y, m).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(d, last)));
}

/** 由 fye(MMDD) 推出某年的 4 个财季末 */
function quarterEnds(fye, year) {
  const m = Number(fye.slice(0, 2));
  const d = Number(fye.slice(2, 4));
  return [0, 3, 6, 9].map((back) => {
    const total = year * 12 + (m - 1) - back;
    const y = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    return clampQuarterEnd(y, mm, d);
  });
}

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** 拉取一家公司的历史发财报日（含 2.02 的 8-K 申报日，降序） */
async function fetchEarningsDates(cik) {
  const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: UA });
  if (!r.ok) throw new Error(`EDGAR HTTP ${r.status}`);
  const j = await r.json();
  const rec = j.filings?.recent;
  if (!rec) return [];
  const out = [];
  for (let i = 0; i < rec.form.length; i++) {
    const items = rec.items[i] || '';
    if (rec.form[i] === '8-K' && /(^|,)2\.02(,|$)/.test(items)) out.push(rec.filingDate[i]);
  }
  return out;
}

function readCache() {
  try {
    const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (j && Date.now() - j.at < CACHE_TTL) return j.companies || null;
  } catch { /* 缓存不存在或损坏，走实时拉取 */ }
  return null;
}

function writeCache(companies) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ at: Date.now(), companies }, null, 2));
  } catch { /* 落盘失败不影响返回 */ }
}

/**
 * 由历史发财报日反推「财季末 → 发财报」的间隔天数，按财季末月份分别取中位数，
 * 再用今天之后的第一个财季末外推出下一财报窗口。
 * 这样能自适应各公司节奏（苹果约 34 天、英伟达约 19-27 天、AMD 约 39 天）。
 */
export function forecast(dates, fye, today) {
  // 先按「财季末」分组，每个财季只留最晚的申报日（真正的财报公告），
  // 避免特斯拉这类一季发多个 2.02（10-02 交付量 + 10-21 财报）把 lag 拉低到 4 天。
  const perQuarter = new Map();
  for (const ds of dates) {
    const d = new Date(ds + 'T00:00:00Z');
    let best = null;
    for (const fy of [d.getUTCFullYear() - 1, d.getUTCFullYear(), d.getUTCFullYear() + 1]) {
      for (const qe of quarterEnds(fye, fy)) {
        if (qe.getTime() <= d.getTime() && (!best || qe > best)) best = qe;
      }
    }
    if (!best) continue;
    const k = iso(best);
    if (!perQuarter.has(k) || perQuarter.get(k) < d) perQuarter.set(k, d);
  }

  const lagByMonth = new Map(); // 财季末月份(0-11) -> [间隔天数]
  for (const [qeIso, d] of perQuarter) {
    const qe = new Date(qeIso + 'T00:00:00Z');
    const lag = Math.round((d - qe) / 86400000);
    if (lag < 0 || lag > 120) continue;
    const key = qe.getUTCMonth();
    if (!lagByMonth.has(key)) lagByMonth.set(key, []);
    lagByMonth.get(key).push(lag);
  }

  // 今天之后（含今天）的所有财季末，按外推日升序，取第一个仍在未来的
  const baseYear = today.getUTCFullYear();
  const candidates = [];
  for (const fy of [baseYear, baseYear + 1, baseYear + 2]) {
    for (const qe of quarterEnds(fye, fy)) {
      const lags = lagByMonth.get(qe.getUTCMonth()) || [];
      const lag = median(lags);
      if (lag == null) continue;
      candidates.push({ qe, when: new Date(qe.getTime() + lag * 86400000), lag, maxLag: Math.max(...lags) });
    }
  }
  candidates.sort((a, b) => a.when - b.when);
  // 允许刚过去 7 天：推算日误差 1-3 天，若严格 >= today 会把亚马逊这类
  // 推算 10-29、今天已 10-30 的公司整家从列表里抹掉。
  const GRACE = 7 * 86400000;
  const next = candidates.find((c) => c.when.getTime() >= today.getTime() - GRACE);
  const last = dates[0] ? new Date(dates[0] + 'T00:00:00Z') : null;
  return {
    lastReport: last ? iso(last) : null,
    lastDaysAgo: last ? Math.round((today - last) / 86400000) : null,
    nextDate: next ? iso(next.when) : null,
    nextDaysAhead: next ? Math.round((next.when - today) / 86400000) : null,
    // windowStart = 财季末，用来表达这个推算日的不确定区间起点
    windowStart: next ? iso(next.qe) : null,
    windowEnd: next ? iso(new Date(next.qe.getTime() + next.maxLag * 86400000)) : null,
    lagDays: next ? next.lag : null,
    samples: dates.length,
  };
}

/**
 * 生成美股财报日历
 * @param {number} days 只看未来 N 天内（默认 45，覆盖苹果/亚马逊这类 10 月底 + 英伟达 11 月中）
 */
export async function buildEarningsCalendar(days = 45) {
  const win = Number.isFinite(Number(days)) && Number(days) > 0 ? Math.floor(Number(days)) : 45;
  const today = bjToday();

  let byTicker = readCache();
  if (!byTicker) {
    byTicker = {};
    for (const c of COMPANIES) {
      try {
        byTicker[c.ticker] = await fetchEarningsDates(c.cik);
      } catch (e) {
        console.warn('[earnings] EDGAR 拉取失败', c.ticker, e.message);
        byTicker[c.ticker] = [];
      }
      await sleep(400); // EDGAR 限流 10 req/s，留足余量
    }
    if (Object.values(byTicker).some((a) => a.length)) writeCache(byTicker);
  }

  const events = [];
  for (const c of COMPANIES) {
    const dates = byTicker[c.ticker] || [];
    if (!dates.length) continue;
    const f = forecast(dates, c.fye, today);
    // 下限 -7：推算日刚过几天仍提示（可能今晚或已发布），但不无限往回翻
    if (f.nextDate == null || f.nextDaysAhead > win || f.nextDaysAhead < -7) continue;
    const status = f.nextDaysAhead > 0 ? 'upcoming' : f.nextDaysAhead === 0 ? 'today' : 'justPassed';
    events.push({
      date: f.nextDate,
      time: '16:00', // 美股财报多在盘前/盘后，此处仅用于同日排序，无实质含义
      ticker: c.ticker,
      company: c.name,
      chain: c.chain,
      aShare: c.aShare,
      weight: c.weight,
      importance: c.weight >= 3 ? 3 : c.weight === 2 ? 2 : 1,
      kind: 'earnings',
      lastReport: f.lastReport,
      lastDaysAgo: f.lastDaysAgo,
      daysAhead: f.nextDaysAhead,
      status,
      windowStart: f.windowStart,
      windowEnd: f.windowEnd,
      lagDays: f.lagDays,
      samples: f.samples,
      note: c.name + '（' + c.ticker + '）季报 · 映射：' + c.aShare + '；超预期/指引乐观 → 次日A股映射方向高开概率大',
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || b.importance - a.importance || a.ticker.localeCompare(b.ticker));

  return {
    events,
    note: '日期由 SEC EDGAR 历史发财报日（8-K Item 2.02 申报日）按财季间隔中位数外推得到，是推算窗口不是官方确认日，可能偏差 1-3 天；美股财报多在美东盘前/盘后公布。',
    source: 'SEC EDGAR submissions API（官方免费，无需 key）',
    unavailable: [
      '台积电 TSM：外国私人发行人提交的 6-K 的 items 字段为空数组，无法识别哪份是财报',
      '三星电子 / SK 海力士：不向 SEC 提交文件，需韩国 DART API key',
    ],
  };
}
