import { useMemo, useState } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtAmount, fmtCap } from '../lib/format.js';

function PoolTable({ rows, onWatch, watchCodes }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.lianban || 1) - (a.lianban || 1) || String(a.firstSeal).localeCompare(String(b.firstSeal))),
    [rows]
  );
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>连板</th><th>名称</th><th>现价</th><th>涨幅</th><th>封单</th>
          <th>首封</th><th>炸板次数</th><th>行业</th><th>流通市值</th><th></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((s) => (
          <tr key={s.code}>
            <td><span className={`lb ${s.lianban >= 3 ? 'lb-high' : ''}`}>{s.lianban || 1}板</span></td>
            <td className="name">{s.name}<small>{s.code}</small></td>
            <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>
            <td className={pctCls(s.pct)}>{fmtPct(s.pct)}</td>
            <td>{fmtAmount(s.sealFund)}</td>
            <td>{s.firstSeal || '-'}</td>
            <td className={s.zhaCount > 0 ? 'warn' : ''}>{s.zhaCount}</td>
            <td>{s.industry}</td>
            <td>{fmtCap(s.floatCap)}</td>
            <td>
              {watchCodes.has(s.code) ? (
                <span className="watched">已加自选</span>
              ) : (
                <button className="mini" onClick={() => onWatch(s.code, s.name)}>+自选</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ZtPool({ tick, pools, onWatch }) {
  const [q, setQ] = useState('');
  const [view, setView] = useState('ladder');
  const watchCodes = useMemo(() => new Set(), []);
  const zt = useMemo(() => {
    const list = pools?.zt || [];
    if (!q.trim()) return list;
    const k = q.trim().toLowerCase();
    return list.filter((s) => s.name.includes(k) || s.code.includes(k) || (s.industry || '').includes(k));
  }, [pools, q]);

  // 天梯：按连板高度分组
  const ladder = useMemo(() => {
    const g = new Map();
    for (const s of zt) {
      const h = s.lianban || 1;
      if (!g.has(h)) g.set(h, []);
      g.get(h).push(s);
    }
    return [...g.entries()].sort((a, b) => b[0] - a[0]);
  }, [zt]);

  return (
    <div className="ztpool">
      <div className="toolbar">
        <input placeholder="搜索 名称/代码/行业" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="hint">共 {zt.length} 家涨停 · 最高 {tick?.maxLianban || 0} 板</span>
        <span className="flex-sp" />
        <button className={`mini ${view === 'ladder' ? 'active-mini' : ''}`} onClick={() => setView('ladder')}>天梯</button>
        <button className={`mini ${view === 'table' ? 'active-mini' : ''}`} onClick={() => setView('table')}>列表</button>
      </div>

      {view === 'ladder' && (
        <div className="tianti">
          {ladder.map(([h, stocks]) => (
            <div className="panel tianti-row" key={h}>
              <div className="tianti-head">
                <span className={`lb ${h >= 3 ? 'lb-high' : ''}`}>{h}板</span>
                <span className="tianti-count">{stocks.length} 只</span>
                <span className="tianti-fund">封单合计 {fmtAmount(stocks.reduce((s, x) => s + (x.sealFund || 0), 0))}</span>
                {h === Math.max(...ladder.map(([hh]) => hh)) && <span className="tag-hot">最高板</span>}
              </div>
              <div className="tianti-stocks">
                {stocks.map((s) => (
                  <button className="stock-chip" key={s.code} title={`${s.industry || ''} · 首封 ${s.firstSeal || '-'} · 炸板${s.zhaCount}次`} onClick={() => onWatch(s.code, s.name)}>
                    <b>{s.name}</b>
                    <span className={pctCls(s.pct)}>{fmtPct(s.pct)}</span>
                    <small>{s.firstSeal || '-'}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {ladder.length === 0 && <div className="empty">暂无涨停数据</div>}
        </div>
      )}

      {view === 'table' && <PoolTable rows={zt} onWatch={onWatch} watchCodes={watchCodes} />}

      <details>
        <summary>炸板池（{pools?.zb?.length || 0}）</summary>
        <table className="tbl">
          <thead><tr><th>名称</th><th>现价</th><th>涨幅</th><th>行业</th><th>炸板次数</th></tr></thead>
          <tbody>
            {(pools?.zb || []).map((s) => (
              <tr key={s.code}>
                <td className="name">{s.name}<small>{s.code}</small></td>
                <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>
                <td className={pctCls(s.pct)}>{fmtPct(s.pct)}</td>
                <td>{s.industry}</td>
                <td className="warn">{s.zhaCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details>
        <summary>跌停池（{pools?.dt?.length || 0}）</summary>
        <table className="tbl">
          <thead><tr><th>名称</th><th>现价</th><th>跌幅</th><th>行业</th></tr></thead>
          <tbody>
            {(pools?.dt || []).map((s) => (
              <tr key={s.code}>
                <td className="name">{s.name}<small>{s.code}</small></td>
                <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>
                <td className={pctCls(s.pct)}>{fmtPct(s.pct)}</td>
                <td>{s.industry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
