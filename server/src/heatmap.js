// 大盘云图：全市场按行业分格的涨跌热力图（数据源 = 本地全市场快照，无额外请求）
import { industryOf } from './industries.js';

// 涨跌幅 → 颜色档位（与常见行情软件一致：红涨绿跌）
function bucketOf(pct) {
  if (pct == null || !Number.isFinite(pct)) return 'flat';
  if (pct >= 9.7) return 'p10';
  if (pct >= 7) return 'p7';
  if (pct >= 5) return 'p5';
  if (pct >= 3) return 'p3';
  if (pct >= 1) return 'p1';
  if (pct > -1) return 'flat';
  if (pct > -3) return 'n1';
  if (pct > -5) return 'n3';
  if (pct > -7) return 'n5';
  if (pct > -9.7) return 'n7';
  return 'n10';
}

// 一档内按实际涨跌幅深浅再分强/弱，让格子颜色有层次
function shadeOf(pct, bucket) {
  if (bucket === 'flat') return 0;
  const m = bucket.startsWith('p') ? 1 : -1;
  const mag = Math.abs(pct);
  // 档位带宽内的相对位置 0~1
  const edges = { p1: [1, 3], p3: [3, 5], p5: [5, 7], p7: [7, 9.7], p10: [9.7, 11],
                  n1: [1, 3], n3: [3, 5], n5: [5, 7], n7: [7, 9.7], n10: [9.7, 11] };
  const [lo, hi] = edges[bucket] || [0, 1];
  const rel = Math.max(0, Math.min(1, (mag - lo) / (hi - lo || 1)));
  return m * (rel >= 0.5 ? 1 : 0);
}

/**
 * 大盘云图
 * @param {object} sweep state.marketSweep（{rows:[...], advancers, decliners, ...}）
 * @param {object} pools state.pools（用于涨停家数与龙头）
 * @returns {{groups:Array, meta:object}|null}
 */
export function buildHeatmap(sweep, pools) {
  if (!sweep || !sweep.rows?.length) return null;

  // 涨停池按行业归组：云图点格子要能看到"这个行业哪几只涨停了"
  // 注意用 industryOf(code) 而非 z.industry——两者口径必须和格子分组一致，
  // 否则涨停股会挂到别的行业格子上
  const ztByIndustry = new Map();
  for (const z of pools?.zt || []) {
    const ind = industryOf(z.code) || '其他';
    let list = ztByIndustry.get(ind);
    if (!list) { list = []; ztByIndustry.set(ind, list); }
    list.push({
      code: z.code, name: z.name,
      lianban: z.lianban || 1,
      sealFund: z.sealFund ? +(z.sealFund / 1e8).toFixed(2) : 0,
      firstSeal: z.firstSeal || null,
      zhaCount: z.zhaCount || 0,
    });
  }
  // 连板高的排前面，同高度按封单大的排前面
  for (const list of ztByIndustry.values()) {
    list.sort((a, b) => b.lianban - a.lianban || b.sealFund - a.sealFund);
  }

  const byIndustry = new Map();

  for (const r of sweep.rows) {
    if (!Number.isFinite(r.pct)) continue;
    const ind = industryOf(r.code) || '其他';
    let g = byIndustry.get(ind);
    if (!g) {
      g = { industry: ind, count: 0, up: 0, down: 0, flat: 0, limitDown: 0,
            sumPct: 0, sumAmount: 0, maxPct: -Infinity, minPct: Infinity,
            leader: null, leaderPct: -Infinity, biggestFall: null, biggestFallPct: Infinity };
      byIndustry.set(ind, g);
    }
    g.count++;
    g.sumPct += r.pct;
    g.sumAmount += r.amount || 0;
    if (r.pct > 0) g.up++; else if (r.pct < 0) g.down++; else g.flat++;
    if (r.pct <= -9.7) g.limitDown++;
    if (r.pct > g.maxPct) g.maxPct = r.pct;
    if (r.pct < g.minPct) g.minPct = r.pct;
    if (r.pct > g.leaderPct) { g.leaderPct = r.pct; g.leader = { code: r.code, name: r.name, pct: r.pct }; }
    if (r.pct < g.biggestFallPct) { g.biggestFallPct = r.pct; g.biggestFall = { code: r.code, name: r.name, pct: r.pct }; }
  }

  // 行业映射覆盖不足的兜底组：industries.js 每个细分行业最多拉 6 页×80=480 只，
  // 大行业的剩余股票会全落到"其他"。若把它当普通行业参与热度排名，会永远霸榜、
  // 淹没真正的板块信号，所以单独拆出来并在 meta 里标注覆盖率。
  const OTHER = '其他';
  const otherG = byIndustry.get(OTHER);
  byIndustry.delete(OTHER);

  const named = [...byIndustry.values()]
    .map((g) => {
      const avgPct = g.count ? g.sumPct / g.count : 0;
      const bucket = bucketOf(avgPct);
      // 涨停数统一取涨停池口径，保证"格子角标数字"与"点开后列出的只数"永远一致
      const ztList = ztByIndustry.get(g.industry) || [];
      return {
        industry: g.industry,
        count: g.count,
        up: g.up, down: g.down, flat: g.flat,
        limitUp: ztList.length, limitDown: g.limitDown,
        avgPct: +avgPct.toFixed(2),
        amount: Math.round(g.sumAmount),
        maxPct: +g.maxPct.toFixed(2),
        minPct: +g.minPct.toFixed(2),
        leader: g.leader, biggestFall: g.biggestFall,
        bucket,
        shade: shadeOf(avgPct, bucket),
        heat: Math.round(g.count * 0.6 + avgPct * 6 + ztList.length * 4),
        hasZt: ztList.length > 0,
        ztList,
      };
    })
    .sort((a, b) => b.heat - a.heat);

  const totalRows = sweep.rows.length;
  const covered = named.reduce((s, g) => s + g.count, 0);

  const groups = [...named];
  if (otherG) {
    const avgPct = otherG.count ? otherG.sumPct / otherG.count : 0;
    const ztList = ztByIndustry.get(OTHER) || [];
    groups.push({
      industry: OTHER,
      count: otherG.count,
      up: otherG.up, down: otherG.down, flat: otherG.flat,
      limitUp: ztList.length, limitDown: otherG.limitDown,
      avgPct: +avgPct.toFixed(2),
      amount: Math.round(otherG.sumAmount),
      maxPct: +otherG.maxPct.toFixed(2),
      minPct: +otherG.minPct.toFixed(2),
      leader: otherG.leader, biggestFall: otherG.biggestFall,
      bucket: bucketOf(avgPct),
      shade: shadeOf(avgPct, bucketOf(avgPct)),
      heat: 0,
      hasZt: ztList.length > 0,
      ztList,
      unmapped: true,
    });
  }

  return {
    groups,
    meta: {
      total: totalRows,
      advancers: sweep.advancers ?? null,
      decliners: sweep.decliners ?? null,
      flat: sweep.flat ?? null,
      updatedAt: sweep.updatedAt,
      industries: named.length,
      mapped: covered,
      unmapped: otherG ? otherG.count : 0,
      mapCoverage: totalRows ? +((covered / totalRows) * 100).toFixed(1) : null,
    },
  };
}
