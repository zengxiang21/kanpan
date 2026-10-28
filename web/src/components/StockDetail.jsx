// 个股详情：实时报价 + 分时图 + 日K走势（从任意页面的股票名点击进入）
import { useEffect, useState } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtAmount, fmtCap } from '../lib/format.js';
import MinuteChart from './MinuteChart.jsx';
import CandleChart from './CandleChart.jsx';
import { fmtPct as fPct } from '../lib/format.js';

export default function StockDetail({ code, name, onBack, onWatch }) {
  const [q, setQ] = useState(null);
  const [peers, setPeers] = useState(null);
  const [tab, setTab] = useState('minute');

  useEffect(() => {
    fetch('/api/peers?code=' + code).then((r) => r.json()).then((d) => !d.error && setPeers(d)).catch(() => {});
  }, [code]);

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

      {peers && (
        <div className="panel">
          <h3>板块内对比 · {peers.industry}（第 {peers.rank}/{peers.total} 名 · 板块涨停 {peers.limitUps} 家）</h3>
          <div className="plan-note">{peers.evaluation?.map((x, i) => <div key={i}>{i === 0 ? '' : '· '}{x}</div>)}</div>
          <table className="tbl compact">
            <thead><tr><th>板块内排名</th><th>名称</th><th>涨幅</th><th>连板</th><th>首封/封单</th></tr></thead>
            <tbody>
              {peers.top.map((t) => (
                <tr key={t.code} className={t.isMe ? 'row-up' : ''}>
                  <td className="muted">{peers.top.findIndex((x) => x.code === t.code) + 1}</td>
                  <td className="name">{t.name}<small>{t.code}</small>{t.isMe && <b> ←本票</b>}</td>
                  <td className={t.pct > 0 ? 'up' : t.pct < 0 ? 'down' : ''}>{fPct(t.pct)}</td>
                  <td>{t.lianban ? t.lianban + '板' : '-'}</td>
                  <td>{t.firstSeal ? t.firstSeal.slice(0, 5) + '/' + Math.round((t.sealFund || 0) / 1e8 * 100) / 100 + '亿' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint">只做板块前 2 名；排名第 3 以后的跟风票溢价最差</div>
        </div>
      )}
    </div>
  );
}
