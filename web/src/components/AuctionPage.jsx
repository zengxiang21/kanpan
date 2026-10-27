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

  const inAuction = data.mode === 'auction';
  const amtLabel = inAuction ? '竞价金额' : '昨日成交额';
  const gapLabel = inAuction ? '高开' : '昨日涨幅(模拟高开)';

  return (
    <div className="page">
      <h2 className="page-title">
        竞价雷达
        <span className={`page-tag ${inAuction ? 'tag-hot' : ''}`}>
          {data.mode === 'auction' ? '集合竞价实时' : data.mode === 'preview' ? '预演模式（非竞价时段）' : '等待数据'}
        </span>
      </h2>
      <div className={`hint ${inAuction ? '' : 'warm-hint'}`} style={{ marginBottom: 10 }}>
        {data.note}
        {inAuction ? '' : ' · 筛选逻辑：高开2%~7% + 非一字 + 金额门槛，按【金额/竞价强度/昨日连板/强势基因】打分'}
      </div>
      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>方向强弱 · 今天做哪个方向（竞价归类聚合）</h3>
        <div className="us-grid">
          {(data.directions || []).slice(0, 8).map((d, i) => (
            <div className={`us-card ${i === 0 ? 'dir-top' : ''}`} key={d.direction}>
              <div className="us-head">
                <b>{i === 0 ? '🥇 ' : ''}{d.direction}</b>
                <span className="up bold">{d.count} 只</span>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                平均高开 +{d.avgGap}% · 最强 {d.maxGap}% · 金额 {(d.amount / 1e8).toFixed(1)}亿 · 代表 {d.top}
              </div>
            </div>
          ))}
          {(data.directions || []).length === 0 && <div className="empty">暂无方向聚合数据</div>}
        </div>
        <div className="hint">
          主攻方向 = 家数多 + 平均高开高 + 金额大 三者兼顾的榜一方向（与板块轮动页的行业涨幅榜交叉验证）；
          方向内只做竞价评分最高的 1~2 只，不做同方向第 3 名以外的跟风
        </div>
      </div>

      <table className="tbl">
        <thead>
          <tr><th>评分</th><th>名称</th><th>方向</th><th>{inAuction ? '竞价价' : '最新价'}</th><th>{gapLabel}</th><th>{amtLabel}</th><th>流通市值</th><th>命中点</th><th></th></tr>
        </thead>
        <tbody>
          {data.rows.length === 0 && (
            <tr><td colSpan={9} className="empty">{inAuction ? '暂无符合条件的候选' : '非竞价时段，以下为昨日强势股预演；9:15 后自动切换为真实竞价'}</td></tr>
          )}
          {data.rows.map((s) => (
            <tr key={s.code}>
              <td><span className={`lb ${s.score >= 70 ? 'lb-high' : ''}`}>{s.score}</span></td>
              <td className="name"><span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}<small>{s.code}</small></span></td>
              <td><span className="dir-tag">{s.direction || '-'}</span></td>
              <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>
              <td className={`bold ${pctCls(s.pct)}`}>{fmtPct(s.pct)}</td>
              <td>{(s.reasons || []).find((r) => r.includes('额'))?.split(' ')[1] || '-'}</td>
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
