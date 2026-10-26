import { useEffect, useRef, useState } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtAmount, fmtCap } from '../lib/format.js';

export default function Watchlist({ watch, onRemove, onAdd }) {
  const [rows, setRows] = useState([]);
  const [input, setInput] = useState('');
  const codes = watch.map((x) => x.code).join(',');
  const names = useRef(new Map(watch.map((x) => [x.code, x.name])));

  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (!codes) {
        setRows([]);
        return;
      }
      try {
        const r = await fetch('/api/quotes?codes=' + codes);
        const d = await r.json();
        if (!stop && Array.isArray(d)) setRows(d);
      } catch {
        /* 忽略，下轮重试 */
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [codes]);

  const submit = (e) => {
    e.preventDefault();
    const code = input.trim();
    if (!/^\d{6}$/.test(code)) return;
    onAdd(code, names.current.get(code) || code);
    setInput('');
  };

  return (
    <div className="watch">
      <form className="toolbar" onSubmit={submit}>
        <input
          placeholder="输入 6 位代码回车添加（如 600519）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <span className="hint">3 秒自动刷新 · 共 {rows.length} 只</span>
      </form>
      <table className="tbl">
        <thead>
          <tr><th>名称</th><th>现价</th><th>涨幅</th><th>量比</th><th>换手</th><th>成交额</th><th>最高/最低</th><th>流通市值</th><th>行业</th><th></th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={10} className="empty">暂无自选股，点击扫描榜/涨停池里的"+自选"，或输入代码添加</td></tr>
          )}
          {rows.map((s) => (
            <tr key={s.code}>
              <td className="name">{s.name}<small>{s.code}</small></td>
              <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>
              <td className={`bold ${pctCls(s.pct)}`}>{fmtPct(s.pct)}</td>
              <td>{s.volRatio ?? '-'}</td>
              <td>{s.turnover != null ? s.turnover.toFixed(2) + '%' : '-'}</td>
              <td>{fmtAmount(s.amount)}</td>
              <td><span className="up">{fmtPrice(s.high)}</span> / <span className="down">{fmtPrice(s.low)}</span></td>
              <td>{fmtCap(s.floatCap)}</td>
              <td>{s.industry}</td>
              <td><button className="mini danger" onClick={() => onRemove(s.code)}>移除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
