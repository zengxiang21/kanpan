// 美债收益率 + 历史百分位
//
// 数据源：FRED（圣路易斯联储）公开 CSV 端点
//   https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10
// **这个端点不需要 API key**——macro.js 注释里「FRED 需有效 API key」的结论
// 只对 api.stlouisfed.org 的 /api/ 端点成立，fredgraph.csv 是公开的。实测可用
// （2026-10-30），DGS10 有 1962-01-02 至今 64 年日频数据。
//
// 调研过但失败的源：
//   新浪 hf_US10YT / int_us10y / hf_TNX 等 8 个代码 → 全部返回空
//   东财 push2 secid=100/101/133/119/153.US10Y   → 全部 data null
//   东财搜索接口搜「美国10年国债」                 → TotalCount 0
//   stooq 10usy.b                                  → Access denied
//   FRED api.stlouisfed.org/api/...                → 需 key
//
// 为什么用百分位而不是绝对值：4.5% 在 2023 年是高位、在 2007 年是低位，
// 脱离历史分布单看数字会误判。百分位才能回答「现在算高还是低」。

const SERIES = {
  DGS10: { name: '美国10年期国债收益率', short: '美债10Y', weight: 3 },
  DGS2: { name: '美国2年期国债收益率', short: '美债2Y', weight: 2 },
  DGS30: { name: '美国30年期国债收益率', short: '美债30Y', weight: 2 },
};

const CSV_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=';

/** 拉一个序列的完整历史：[{date, value}]，跳过 FRED 用 "." 表示的缺失日 */
async function fetchSeries(id) {
  const r = await fetch(CSV_URL + id, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`FRED HTTP ${r.status}`);
  const txt = await r.text();
  const out = [];
  for (const line of txt.split('\n').slice(1)) {
    const [d, v] = line.split(',');
    if (!d || v == null || v === '' || v === '.' || v === '.') continue;
    const n = Number(v);
    if (Number.isFinite(n)) out.push({ date: d.trim(), value: n });
  }
  return out;
}

/** 百分位：value 在 series 中的位置（0-100）。等于「有多少比例的历史值低于当前值」 */
function percentileOf(series, value) {
  if (!series.length || value == null) return null;
  let below = 0;
  for (const p of series) if (p.value < value) below++;
  return +((below / series.length) * 100).toFixed(1);
}

/** 取最近 N 天的子序列，用于短周期百分位 */
function tail(series, days) {
  return series.slice(-days);
}

function levelOf(pct) {
  if (pct == null) return { label: '未知', cls: 'muted' };
  if (pct >= 90) return { label: '极高', cls: 'up' };
  if (pct >= 70) return { label: '偏高', cls: 'warn' };
  if (pct >= 30) return { label: '中性', cls: '' };
  if (pct >= 10) return { label: '偏低', cls: 'down' };
  return { label: '极低', cls: 'down' };
}

/**
 * 生成美债收益率面板
 * @param {number} limit 最近多少个交易日用于画趋势（默认 120）
 */
export async function buildTreasury(limit = 120) {
  const n = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(500, Math.floor(Number(limit))) : 120;
  const ids = Object.keys(SERIES);

  const loaded = await Promise.all(ids.map((id) => fetchSeries(id).catch(() => [])));
  const series = {};
  ids.forEach((id, i) => { series[id] = loaded[i]; });

  const rows = [];
  for (const id of ids) {
    const s = series[id];
    if (!s.length) continue;
    const cur = s[s.length - 1];
    const prev = s.length > 1 ? s[s.length - 2] : null;
    rows.push({
      id,
      name: SERIES[id].name,
      short: SERIES[id].short,
      weight: SERIES[id].weight,
      value: cur.value,
      date: cur.date,
      prev: prev ? prev.value : null,
      change: prev ? +(cur.value - prev.value).toFixed(3) : null,
      // 多周期百分位：全历史太长会钝化，短周期反映当下位置
      pctAll: percentileOf(s, cur.value),
      pct10y: percentileOf(tail(s, 2500), cur.value),
      pct3y: percentileOf(tail(s, 730), cur.value),
      pct1y: percentileOf(tail(s, 250), cur.value),
      level: levelOf(percentileOf(tail(s, 2500), cur.value)),
      // 最近 N 日趋势（画图用）
      trend: s.slice(-n).map((p) => [p.date, p.value]),
    });
  }

  // 期限利差 10Y-2Y：倒挂是经典衰退信号
  const y10 = rows.find((r) => r.id === 'DGS10');
  const y2 = rows.find((r) => r.id === 'DGS2');
  let spread = null;
  if (y10 && y2) {
    const v = +(y10.value - y2.value).toFixed(3);
    const s10 = series.DGS10;
    const s2 = series.DGS2;
    // 用共同日期算利差历史，避免序列长度不一致
    const m2 = new Map(s2.map((p) => [p.date, p.value]));
    const hist = [];
    for (const p of s10) {
      const b = m2.get(p.date);
      if (b != null) hist.push(p.value - b);
    }
    spread = {
      value: v,
      inverted: v < 0,
      label: v < 0 ? '收益率曲线倒挂' : v < 0.3 ? '曲线平坦' : '曲线正常上倾',
      note: v < 0
        ? '10Y 低于 2Y，历史上倒挂多伴随衰退预期，压制风险偏好'
        : v < 0.3
          ? '长短端接近，市场对增长前景分歧'
          : '正常上倾，通常对应经济预期稳健',
      pctAll: percentileOf(hist.map((x) => ({ value: x })), v),
    };
  }

  rows.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));

  return {
    rows,
    spread,
    note: '数据源 FRED（圣路易斯联储）公开 CSV 端点，无需 key，日频。百分位 = 当前值在对应历史窗口中的位置（有多少比例的历史值低于当前值）。',
    source: 'FRED fredgraph.csv（DGS10/DGS2/DGS30）',
  };
}
