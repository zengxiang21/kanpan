// 竞价雷达：方向强弱聚合 + 方向内龙头排序（连板/首封/封单）+ 竞价与收盘涨幅复盘 + 龙虎榜标记
import { useEffect, useState, useRef } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtCap, fmtAmount } from '../lib/format.js';
import { api, CLOUD } from '../lib/api.js';

function notify(title, body) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body });
  } catch { /* 忽略 */ }
}

export default function AuctionPage({ onWatch, onOpenStock }) {
  const [data, setData] = useState({ mode: 'preview', rows: [], directions: [], note: '' });
  const [selDir, setSelDir] = useState(null);
  const [viewDate, setViewDate] = useState('');
  const [dates, setDates] = useState([]);
  const [only12, setOnly12] = useState(false);
  const prevMode = useRef(null);

  useEffect(() => {
    api('auctionDates').then((d) => Array.isArray(d) && setDates(d)).catch(() => {});
  }, []);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const d = await api(viewDate ? 'auction?date=' + viewDate : 'auction');
        if (!stop && d && d.mode) {
          // 竞价定稿瞬间（auction → auction_end）：推送竞价 Top3 与主攻方向
          if (prevMode.current === 'auction' && d.mode === 'auction_end') {
            const top = (d.rows || []).slice(0, 3).map((x) => `${x.name}(${(x.direction || '').slice(0, 6)})`).join('、');
            const dir = d.directions?.[0];
            notify('📢 竞价 Top3 定稿', `${top}${dir ? ` · 主攻：${dir.direction} ${d.count || ''}` : ''}`);
          }
          prevMode.current = d.mode;
          setData(d);
        }
      } catch { /* 保留旧数据 */ }
    };
    load();
    if (viewDate) return () => { stop = true; };
    const t = setInterval(load, 10_000);
    return () => { stop = true; clearInterval(t); };
  }, [viewDate]);

  const inAuction = data.mode === 'auction';
  const showClose = data.mode !== 'preview';
  const amtLabel = inAuction ? '竞价金额' : '昨日成交额';
  const gapLabel = inAuction ? '竞价涨幅' : '昨日涨幅(预演)';

  // 方向钻取：选中方向后按"短线龙头强度"排序（连板高 → 首封早 → 封单大）
  let rows = data.rows || [];
  if (selDir) {
    rows = rows.filter((r) => r.direction === selDir);
    rows = [...rows].sort((a, b) => {
      const la = a.lianban || 0, lb = b.lianban || 0;
      if (la !== lb) return lb - la;
      const fa = a.firstSeal || '99:99:99', fb = b.firstSeal || '99:99:99';
      if (fa !== fb) return fa.localeCompare(fb);
      return (b.sealFund || 0) - (a.sealFund || 0);
    });
  }
  if (only12) rows = rows.filter((r) => r.lianban === 1);

  return (
    <div className="page">
      <h2 className="page-title">
        竞价雷达
        <span className={`page-tag ${inAuction ? 'tag-hot' : ''}`}>
          {data.mode === 'auction' ? '集合竞价实时' : data.mode === 'preview' ? '预演模式（非竞价时段）' : '存档回看'}
        </span>
        {dates.length > 0 && (
          <select className="date-select" value={viewDate} onChange={(e) => { setViewDate(e.target.value); setSelDir(null); }}>
            <option value="">最新（实时）</option>
            {dates.map((d) => <option key={d} value={d}>存档 {d.slice(4, 6)}/{d.slice(6, 8)}</option>)}
          </select>
        )}
      </h2>
      <div className={`hint ${inAuction ? '' : 'warm-hint'}`} style={{ marginBottom: 10 }}>
        {data.note}
        {data.lhbDate ? ` · 🐉 标记 = ${data.lhbDate.slice(4, 6)}/${data.lhbDate.slice(6, 8)} 龙虎榜个股` : ''}
        {' · 只含有涨停基因的超短票'}
        <button className={`mini ${only12 ? 'active-mini' : ''}`} style={{ marginLeft: 10 }} onClick={() => setOnly12(!only12)}>
          {only12 ? '✓ 一进二候选' : '只看一进二（昨日首板）'}
        </button>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>方向强弱 · 今天做哪个方向（点击方向看该方向龙头排序）</h3>
        <div className="us-grid">
          {(data.directions || []).map((d, i) => (
            <button className={`us-card dir-btn ${selDir === d.direction ? 'dir-top' : ''}`} key={d.direction}
              onClick={() => setSelDir(selDir === d.direction ? null : d.direction)}
              title="点击筛选该方向并按龙头强度排序">
              <div className="us-head">
                <b>{i === 0 && !selDir ? '🥇 ' : ''}{d.direction}</b>
                <span className="up bold">{d.count} 只</span>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                平均 +{d.avgGap}% · 最强 +{d.maxGap}% · 金额 {(d.amount / 1e8).toFixed(1)}亿{d.sealed ? ` · 已封 ${d.sealed}` : ''} · 代表 {d.top}
              </div>
            </button>
          ))}
          {(data.directions || []).length === 0 && <div className="empty">暂无方向聚合数据</div>}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          主攻方向 = 家数多 + 平均高开高 + 金额大 的榜一方向（与板块轮动页交叉验证）；方向内按【连板高→首封早→封单大】做龙头，不做同方向第 3 名以外跟风
          {selDir ? ` · 当前筛选：${selDir}` : ' · 点击任一方向卡片进行钻取'}
        </div>
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th>评分</th><th>名称</th><th>方向</th><th>连板</th><th>首封/封单</th>
            <th>{gapLabel}</th>
            {showClose && <th>收盘涨幅</th>}
            {showClose && <th>结果</th>}
            <th>流通市值</th><th>业绩</th><th>命中点</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={showClose ? 11 : 9} className="empty">
              {selDir ? `方向【${selDir}】暂无候选` : '暂无候选 —— 竞价时段实时刷新；预演模式显示昨日强势票'}
            </td></tr>
          )}
          {rows.map((s) => (
            <tr key={s.code}>
              <td><span className={`lb ${s.score >= 70 ? 'lb-high' : ''}`}>{s.score}</span></td>
              <td className="name">
                <span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}<small>{s.code}</small></span>
                {s.lhb && <span className="lhb-badge" title="昨日上龙虎榜">🐉</span>}
              </td>
              <td><span className="dir-tag">{s.direction || '-'}</span></td>
              <td>{s.lianban ? `${s.lianban}板` : '-'}</td>
              <td>{s.firstSeal ? `${s.firstSeal.slice(0, 5)}/${fmtAmount(s.sealFund)}` : '-'}</td>
              <td className={`bold ${pctCls(s.gap)}`}>{fmtPct(s.gap)}</td>
              {showClose && (
                <td className={s.closePct != null ? pctCls(s.closePct) : 'muted'}>
                  {s.closePct != null ? fmtPct(s.closePct) : !viewDate ? fmtPct(s.pct) + '*' : '-'}
                </td>
              )}
              {showClose && (
                <td>
                  {s.correct != null ? (
                    <span className={`lb ${s.correct > 0 ? 'lb-high' : 'lb-green'}`}>{s.correct > 0 ? `✓ +${s.correct}%` : `✗ ${s.correct}%`}</span>
                  ) : s.closePct != null ? <span className="muted">平</span> : '-'}
                </td>
              )}
              <td>{fmtCap(s.floatCap)}</td>
              <td>{s.earn ? <span className={`${s.earn.superExpect ? 'lb lb-high' : 'dir-tag'}`} title={s.earn.content || ''}>{s.earn.type}{s.earn.add != null ? `+${s.earn.add}%` : ''}</span> : '-'}</td>
              <td className="muted reasons-cell">{(s.reasons || []).join(' · ')}</td>
              <td><button className="mini" onClick={() => onWatch(s.code, s.name)}>+自选</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint" style={{ marginTop: 8 }}>
        {showClose
          ? '复盘口径：结果 = 收盘涨幅 − 竞价涨幅，>0 代表"9:25 按信号竞价买入"当日浮盈 ✓。带 * 为盘中实时涨幅（收盘后自动回填定稿）。'
          : '预演模式说明：9:15 前不存在"竞价涨幅"，此列为昨日涨幅仅供预演；9:25 定稿后本页自动出现"竞价涨幅 vs 收盘涨幅"的复盘两列。'}
      </div>
    </div>
  );
}
