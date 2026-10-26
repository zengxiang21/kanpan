// 策略回测：在本地日线历史库上重放形态条件，统计信号后的收益分布
// 买入 = 信号次日开盘价；统计 买入当日收盘 / 第3日收盘 / 第5日收盘 / 3日内最大冲高
import { historyState } from './history.js';

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// ---- 底部放量（信号bar = i，即"当日"） ----
function checkDifang(h, i) {
  if (i < 45) return false;
  const bar = h[i], prev = h[i - 1];
  const vol5 = avg(h.slice(i - 5, i).map((b) => b[5]));
  if (!vol5 || bar[5] < vol5 * 2) return false;
  const pct = (bar[2] / prev[2] - 1) * 100;
  if (pct < 2 || pct > 9.5) return false;
  if (bar[2] >= prev[2] * 1.097) return false; // 近似已涨停
  const seg = h.slice(Math.max(0, i - 59), i + 1);
  const l60 = Math.min(...seg.map((b) => b[4]));
  const h60 = Math.max(...seg.map((b) => b[3]));
  if (h60 <= l60) return false;
  if ((bar[2] - l60) / (h60 - l60) > 0.4) return false;
  const ma5 = avg(h.slice(i - 4, i + 1).map((b) => b[2]));
  if (bar[2] < ma5 * 0.995) return false;
  return true;
}

// ---- 缩量回踩 ----
function checkHuita(h, i) {
  if (i < 25) return false;
  const bar = h[i], prev = h[i - 1];
  // 近10日（不含信号日）强势基因
  let strong = 0;
  for (let k = i - 10; k < i; k++) {
    if (k >= 1 && h[k - 1][2] > 0) {
      const chg = h[k][2] / h[k - 1][2] - 1;
      if (chg >= 0.05 || chg >= 0.093) strong++;
    }
  }
  if (!strong) return false;
  const pct = (bar[2] / prev[2] - 1) * 100;
  if (pct < -2.5 || pct > 3) return false;
  const closes = h.slice(0, i + 1).map((b) => b[2]);
  const ma5 = avg(closes.slice(-5)), ma10 = avg(closes.slice(-10)), ma20 = avg(closes.slice(-20));
  if (!(ma5 >= ma10 && ma10 >= ma20 * 0.99)) return false;
  if (bar[2] < ma20) return false;
  if (Math.abs(bar[2] / ma5 - 1) > 0.025 && Math.abs(bar[2] / ma10 - 1) > 0.025) return false;
  const vol5 = avg(h.slice(i - 5, i).map((b) => b[5]));
  if (!vol5 || bar[5] > vol5 * 0.85) return false;
  if (bar[2] >= prev[2] * 1.097) return false;
  return true;
}

let cache = { key: null, data: null };

export function runBacktest() {
  const key = `${historyState.meta.count}-${historyState.meta.lastBarDate}`;
  if (cache.key === key) return cache.data;

  const stats = {
    difang: { name: '底部放量', count: 0, t1: [], t3: [], t5: [], hi: [], wins: [] },
    huita: { name: '缩量回踩', count: 0, t1: [], t3: [], t5: [], hi: [], wins: [] },
  };
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

  for (const bars of Object.values(historyState.bars)) {
    if (bars.length < 50) continue;
    for (let i = 45; i < bars.length - 6; i++) {
      // 信号日若是"今天"，次日尚未存在，天然跳过（循环上界已保证 i+6 有效）
      const barDate = bars[i][0];
      if (barDate >= today) continue;
      for (const [key2, check] of [['difang', checkDifang], ['huita', checkHuita]]) {
        if (!check(bars, i)) continue;
        const s = stats[key2];
        const entry = bars[i + 1][1]; // 次日开盘买入
        if (!entry || entry <= 0) continue;
        s.count++;
        s.t1.push(bars[i + 1][2] / entry - 1);
        s.t3.push(bars[i + 3][2] / entry - 1);
        s.t5.push(bars[i + 5][2] / entry - 1);
        s.hi.push(Math.max(...bars.slice(i + 1, i + 4).map((b) => b[3])) / entry - 1);
        const r3 = bars[i + 3][2] / entry - 1;
        s.wins.push(r3 > 0 ? 1 : 0);
      }
    }
  }

  const pack = (s) => {
    const w = s.wins.filter(Boolean).length;
    const aw = avg(s.t3.filter((r) => r > 0));
    const al = Math.abs(avg(s.t3.filter((r) => r <= 0)));
    return {
      name: s.name,
      count: s.count,
      r1: +(avg(s.t1) * 100).toFixed(2),
      r3: +(avg(s.t3) * 100).toFixed(2),
      r5: +(avg(s.t5) * 100).toFixed(2),
      max3: +(avg(s.hi) * 100).toFixed(2),
      win3: s.t3.length ? Math.round((w / s.t3.length) * 100) : null,
      pl: al > 0 ? +(aw / al).toFixed(2) : null,
    };
  };

  const out = {
    difang: pack(stats.difang),
    huita: pack(stats.huita),
    stockCount: Object.keys(historyState.bars).length,
    lastDate: historyState.meta.lastBarDate,
  };
  cache = { key, data: out };
  return out;
}
