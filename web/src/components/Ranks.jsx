import { fmtPrice, fmtPct, pctCls, fmtAmount, fmtCap } from '../lib/format.js';

function RankTable({ title, rows, keyName, onWatch, onOpenStock }) {
  return (
    <div className="panel rank-panel">
      <h3>{title}</h3>
      <table className="tbl compact">
        <thead>
          <tr><th>名称</th><th>现价</th><th>涨幅</th><th>{keyName}</th><th>行业</th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.code} onClick={() => onWatch(s.code, s.name)} title="点击加入自选">
              <td className="name"><span className="name-link" onClick={(e) => { e.stopPropagation(); onOpenStock(s.code, s.name); }}>{s.name}<small>{s.code}</small></span></td>
              <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>
              <td className={pctCls(s.pct)}>{fmtPct(s.pct)}</td>
              <td>{keyName === '量比' ? (s.volRatio ?? '-') : keyName === '换手' ? (s.turnover != null ? s.turnover.toFixed(2) + '%' : '-') : fmtAmount(s.amount)}</td>
              <td>{s.industry}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Ranks({ tick, onWatch, onOpenStock }) {
  if (!tick) return <div className="empty">连接行情服务中…</div>;
  const volTitle = tick.volRankDegraded ? '换手榜（备源降级）' : '量比榜';
  const volKey = tick.volRankDegraded ? '换手' : '量比';
  return (
    <div className="ranks">
      <RankTable title="涨幅榜" rows={tick.gainers || []} keyName="量比" onWatch={onWatch} onOpenStock={onOpenStock} />
      <RankTable title={volTitle} rows={tick.volRatio || []} keyName={volKey} onWatch={onWatch} onOpenStock={onOpenStock} />
      <RankTable title="成交额榜" rows={tick.amountTop || []} keyName="成交额" onWatch={onWatch} onOpenStock={onOpenStock} />
    </div>
  );
}
