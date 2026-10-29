// 大盘云图：全市场按行业分格的涨跌热力图
// 数据来自 /api/heatmap（本地全市场快照聚合，无额外外部请求）
import { useEffect, useState } from 'react';
import { fmtPct } from '../lib/format.js';
import { api, CLOUD } from '../lib/api.js';

function clsOf(g) {
  return `hm-cell hm-${g.bucket}${g.shade ? ` hm-s${g.shade > 0 ? 'p' : 'n'}` : ''}${g.unmapped ? ' hm-unmapped' : ''}`;
}

const SORTS = [
  { key: 'heat', label: '热度' },
  { key: 'avgPct', label: '涨幅' },
  { key: 'limitUp', label: '涨停数' },
  { key: 'count', label: '家数' },
  { key: 'amount', label: '成交额' },
];

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'zt', label: '有涨停' },
  { key: 'up', label: '全红' },
  { key: 'down', label: '全绿' },
];

export default function HeatmapPage({ onOpenStock }) {
  const [data, setData] = useState(null);
  const [sort, setSort] = useState('heat');
  const [filter, setFilter] = useState('all');
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const d = await api('heatmap');
        if (!stop && d) setData(d);
      } catch { /* 下轮重试 */ }
    };
    load();
    if (CLOUD) return () => { stop = true; };
    const t = setInterval(load, 30_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const groups = data?.groups || [];
  const meta = data?.meta || {};

  const shown = groups
    .filter((g) => {
      if (filter === 'zt') return g.limitUp > 0;
      if (filter === 'up') return g.down === 0 && g.up > 0;
      if (filter === 'down') return g.up === 0 && g.down > 0;
      return true;
    })
    // 「其他」是映射兜底组，永远排在最后，不参与排序竞争
    .sort((a, b) => (b.unmapped ? 1 : 0) - (a.unmapped ? 1 : 0) || (b[sort] ?? 0) - (a[sort] ?? 0));

  const upCount = groups.filter((g) => g.avgPct > 0).length;
  const downCount = groups.filter((g) => g.avgPct < 0).length;
  const ztGroups = groups.filter((g) => g.limitUp > 0).length;

  if (!groups.length) {
    return (
      <div className="page">
        <h2 className="page-title">大盘云图</h2>
        <div className="empty">等待全市场快照…（首次启动约需 20 秒；非交易日显示上一交易日数据）</div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2 className="page-title">
        大盘云图
        <span className="page-tag">全市场 {meta.total ?? '-'} 只 · {meta.industries ?? groups.length} 个行业</span>
      </h2>

      <div className="cards" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="k">涨跌家数</div>
          <div className="v">
            <span className="up">{meta.advancers ?? '-'}</span>
            <span className="muted"> / </span>
            <span className="down">{meta.decliners ?? '-'}</span>
          </div>
          <div className="note">平盘 {meta.flat ?? '-'}（新浪全市场扫描口径）</div>
        </div>
        <div className="card">
          <div className="k">板块红绿</div>
          <div className="v">
            <span className="up">{upCount}</span>
            <span className="muted"> / </span>
            <span className="down">{downCount}</span>
          </div>
          <div className="note">按行业平均涨跌幅统计</div>
        </div>
        <div className="card">
          <div className="k">有涨停的板块</div>
          <div className="v">{ztGroups}</div>
          <div className="note">点格子看该行业明细</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="hm-toolbar">
          <div className="hm-group">
            <span className="hm-lbl">排序</span>
            {SORTS.map((s) => (
              <button key={s.key} className={`chip ${sort === s.key ? 'on' : ''}`} onClick={() => setSort(s.key)}>{s.label}</button>
            ))}
          </div>
          <div className="hm-group">
            <span className="hm-lbl">筛选</span>
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
        </div>
        <div className="hint">
          格子颜色 = 该行业平均涨跌幅，格内数字为上涨/下跌家数。热度 = 家数 × 0.6 + 平均涨幅 × 6 + 涨停家数 × 4，主攻方向排在前。
          {meta.mapCoverage != null && (
            <>行业映射覆盖 {meta.mapCoverage}%（{meta.mapped}/{meta.total}），未覆盖的归入末尾「其他」，不参与热度排名。</>
          )}
        </div>
      </div>

      <div className="hm-grid">
        {shown.map((g) => (
          <button
            key={g.industry}
            className={clsOf(g)}
            onClick={() => setPicked(picked?.industry === g.industry ? null : g)}
            title={`${g.industry}：均涨 ${g.avgPct}% · ${g.count} 只（${g.up}涨/${g.down}跌）· 涨停 ${g.limitUp}`}
          >
            <span className="hm-name">{g.industry}{g.unmapped ? '（未映射）' : ''}</span>
            <span className="hm-pct">{g.avgPct > 0 ? '+' : ''}{g.avgPct}%</span>
            <span className="hm-sub">
              <span className="up">{g.up}</span>/<span className="down">{g.down}</span>
              {g.limitUp > 0 && <em className="hm-zt">{g.limitUp}板</em>}
            </span>
          </button>
        ))}
        {shown.length === 0 && <div className="empty">该筛选下没有行业</div>}
      </div>

      {picked && (
        <div className="panel" style={{ marginTop: 12 }}>
          <h3>
            {picked.industry}
            <span className="muted" style={{ fontSize: 12, fontWeight: 'normal', marginLeft: 8 }}>
              {picked.count} 只 · 均涨 {picked.avgPct > 0 ? '+' : ''}{picked.avgPct}% · 涨停 {picked.limitUp} · 跌停 {picked.limitDown}
            </span>
          </h3>
          <div className="hm-detail">
            <div>
              <div className="k">领涨</div>
              {picked.leader ? (
                <button className="link" onClick={() => onOpenStock?.(picked.leader.code, picked.leader.name)}>
                  {picked.leader.name} <span className="up">{fmtPct(picked.leader.pct)}</span>
                </button>
              ) : '-'}
            </div>
            <div>
              <div className="k">领跌</div>
              {picked.biggestFall ? (
                <button className="link" onClick={() => onOpenStock?.(picked.biggestFall.code, picked.biggestFall.name)}>
                  {picked.biggestFall.name} <span className="down">{fmtPct(picked.biggestFall.pct)}</span>
                </button>
              ) : '-'}
            </div>
            <div>
              <div className="k">最高/最低</div>
              <div className="v" style={{ fontSize: 14 }}>
                <span className="up">{fmtPct(picked.maxPct)}</span>
                <span className="muted"> / </span>
                <span className="down">{fmtPct(picked.minPct)}</span>
              </div>
            </div>
            <div>
              <div className="k">成交额</div>
              <div className="v" style={{ fontSize: 14 }}>{(picked.amount / 1e8).toFixed(1)} 亿</div>
            </div>
            <div>
              <div className="k">涨停家数</div>
              <div className="v" style={{ fontSize: 14 }}>{picked.limitUp}</div>
              <div className="note">{picked.limitUp > 0 ? '有高度板可做龙头' : '无涨停，观望为主'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
