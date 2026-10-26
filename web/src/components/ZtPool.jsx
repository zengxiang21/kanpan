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
  const watchCodes = useMemo(() => new Set(), []); // 自选集合由 ZtPool 外部传入更佳，此处仅展示
  const zt = useMemo(() => {
    const list = pools?.zt || [];
    if (!q.trim()) return list;
    const k = q.trim().toLowerCase();
    return list.filter((s) => s.name.includes(k) || s.code.includes(k) || (s.industry || '').includes(k));
  }, [pools, q]);

  return (
    <div className="ztpool">
      <div className="toolbar">
        <input placeholder="搜索 名称/代码/行业" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="hint">共 {zt.length} 家涨停 · 数据 {tick ? '实时' : ''}</span>
      </div>
      <PoolTable rows={zt} onWatch={onWatch} watchCodes={watchCodes} />

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
