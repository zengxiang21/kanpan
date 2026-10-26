// 竞价雷达：9:15-9:25 集合竞价抢筹候选（竞价时段 10 秒刷新）
import { useEffect, useState } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtCap } from '../lib/format.js';

export default function AuctionPage({ onWatch, onOpenStock }) {
  const [data, setData] = useState({ rows: [], note: '' });
  const [phase, setPhase] = useState('');

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch('/api/auction');
        const d = await r.json();
        if (!stop) {
          setData(d);
          setPhase(d.phase);
        }
      } catch { /* 下轮重试 */ }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const inAuction = phase === 'auction' || phase === 'auction_end';

  return (
    <div className="page">
      <h2 className="page-title">
        竞价雷达
        <span className={`page-tag ${inAuction ? 'tag-hot' : ''}`}>
          {phase === 'auction' ? '集合竞价进行中' : phase === 'auction_end' ? '竞价已定，待开盘' : '非竞价时段（9:15-9:25 实时生效）'}
        </span>
      </h2>
      <div className="hint" style={{ marginBottom: 10 }}>
        筛选逻辑：竞价高开 2%~7% + 非一字 + 竞价金额≥200万，按【竞价金额/竞价量比/昨日连板/强势基因】打分。
        {data.note ? ' · ' + data.note : ''}
      </div>
      <table className="tbl">
        <thead>
          <tr><th>评分</th><th>名称</th><th>竞价价</th><th>高开</th><th>竞价金额</th><th>流通市值</th><th>命中点</th><th></th></tr>
        </thead>
        <tbody>
          {data.rows.length === 0 && (
            <tr><td colSpan={8} className="empty">暂无候选 —— 9:15 后竞价数据进来会自动刷新；非竞价时段展示的是最近快照的高开模拟</td></tr>
          )}
          {data.rows.map((s) => (
            <tr key={s.code}>
              <td><span className={`lb ${s.score >= 70 ? 'lb-high' : ''}`}>{s.score}</span></td>
              <td className="name"><span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}<small>{s.code}</small></span></td>
              <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>
              <td className={`bold ${pctCls(s.pct)}`}>{fmtPct(s.pct)}</td>
              <td>{s.reasons?.find((r) => r.includes('金额'))?.replace('竞价金额 ', '') || '-'}</td>
              <td>{fmtCap(s.floatCap)}</td>
              <td className="muted reasons-cell">{(s.reasons || []).join(' · ')}</td>
              <td><button className="mini" onClick={() => onWatch(s.code, s.name)}>+自选</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
