// 个股详情：实时报价 + 分时图 + 日K走势（从任意页面的股票名点击进入）
import { useEffect, useState } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtAmount, fmtCap } from '../lib/format.js';
import MinuteChart from './MinuteChart.jsx';
import CandleChart from './CandleChart.jsx';

export default function StockDetail({ code, name, onBack, onWatch }) {
  const [q, setQ] = useState(null);
  const [tab, setTab] = useState('minute');

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const rows = await (await fetch('/api/quotes?codes=' + code)).json();
        if (!stop && Array.isArray(rows) && rows[0]) setQ(rows[0]);
      } catch { /* 下轮重试 */ }
    };
    load();
    const t = setInterval(load, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [code]);

  return (
    <div className="page">
      <div className="stock-head">
        <button className="mini" onClick={onBack}>← 返回</button>
        <h2 className="page-title" style={{ margin: 0 }}>
          {q?.name || name || code}
          <small className="muted" style={{ fontSize: 13, marginLeft: 6 }}>{code}</small>
          {q && <span className={`bold ${pctCls(q.pct)}`} style={{ fontSize: 22 }}>{fmtPrice(q.price)} {fmtPct(q.pct)}</span>}
        </h2>
        <span className="flex-sp" />
        <button className="mini" onClick={() => onWatch(code, q?.name || name || code)}>+自选</button>
      </div>

      {q && (
        <div className="cards">
          <div className="card"><div className="k">最高 / 最低</div><div className="v"><span className="up">{fmtPrice(q.high)}</span> / <span className="down">{fmtPrice(q.low)}</span></div></div>
          <div className="card"><div className="k">今开 / 昨收</div><div className="v small-v">{fmtPrice(q.prevClose != null ? q.price : null)}</div><div className="note">昨收 {fmtPrice(q.prevClose)}</div></div>
          <div className="card"><div className="k">量比</div><div className="v">{q.volRatio ?? '-'}</div><div className="note">换手 {q.turnover != null ? q.turnover.toFixed(2) + '%' : '-'}</div></div>
          <div className="card"><div className="k">成交额</div><div className="v">{fmtAmount(q.amount)}</div><div className="note">流通市值 {fmtCap(q.floatCap)}</div></div>
          <div className="card"><div className="k">行业</div><div className="v small-v">{q.industry || '-'}</div></div>
        </div>
      )}

      <div className="panel">
        <div className="toolbar">
          <button className={`mini ${tab === 'minute' ? 'active-mini' : ''}`} onClick={() => setTab('minute')}>分时</button>
          <button className={`mini ${tab === 'kline' ? 'active-mini' : ''}`} onClick={() => setTab('kline')}>日K</button>
        </div>
        {tab === 'minute' ? <MinuteChart code={code} name={q?.name || name} /> : <CandleChart code={code} name={q?.name || name} />}
      </div>
    </div>
  );
}
