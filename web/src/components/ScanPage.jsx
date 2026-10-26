// 形态选股：放量突破 / 缩量回踩 / 龙头回流（section 参数决定主视图）
import { useEffect, useState, useCallback } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtCap } from '../lib/format.js';

function ScanTable({ rows, onWatch, onOpenStock, emptyText }) {
  return (
    <table className="tbl">
      <thead>
        <tr><th>评分</th><th>名称</th><th>现价</th><th>涨幅</th><th>量能倍数</th><th>换手</th><th>流通市值</th><th>命中点</th><th></th></tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={9} className="empty">{emptyText}</td></tr>}
        {rows.map((s) => (
          <tr key={s.code}>
            <td><span className={`lb ${s.score >= 75 ? 'lb-high' : ''}`}>{s.score}</span></td>
            <td className="name"><span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}<small>{s.code}</small></span></td>
            <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>
            <td className={`bold ${pctCls(s.pct)}`}>{fmtPct(s.pct)}</td>
            <td>{s.volTimes != null ? s.volTimes + '×' : '-'}</td>
            <td>{s.turnover != null ? s.turnover.toFixed(1) + '%' : '-'}</td>
            <td>{fmtCap(s.floatCap)}</td>
            <td className="muted reasons-cell">{(s.reasons || []).join(' · ')}</td>
            <td><button className="mini" onClick={() => onWatch(s.code, s.name)}>+自选</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ScanPage({ tick, onWatch, onOpenStock, section = 'scan' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/scan');
      setData(await r.json());
    } catch { /* 保留旧数据 */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!auto) return;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load, auto]);

  const meta = data?.meta;
  const historyReady = meta?.historyReady;

  return (
    <div className="page">
      <h2 className="page-title">
        {section === 'reflow' ? '龙头回流预期' : '形态选股扫描器'}
        <span className="page-tag">{loading ? '扫描中…' : `快照 ${meta?.snapshotCount || 0} 只`}</span>
        <label className="auto-label"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 60秒自动扫描</label>
        <button className="mini" onClick={load}>立即扫描</button>
      </h2>

      {!historyReady && (
        <div className="hint warm-hint" style={{ marginBottom: 10 }}>
          日线历史库{'下载中 ' + (meta ? `${meta.downloadDone}/${meta.downloadTotal}` : '') + '（首次约 3~10 分钟，完成后扫描才有结果）'}
        </div>
      )}
      {historyReady && (
        <div className="hint" style={{ marginBottom: 10 }}>
          历史库 {meta.historyCount} 只 · 最新bar {meta.lastBarDate} · 基于最新全市场快照实时计算
        </div>
      )}

      {section !== 'reflow' && (
        <>
          <div className="panel" style={{ marginBottom: 12 }}>
            <h3>放量突破 · 量比≥1.8 + 突破20日高 + 涨3%~7%未板（能上车的位置）</h3>
            <ScanTable rows={data?.fangliang || []} onWatch={onWatch} onOpenStock={onOpenStock} emptyText={historyReady ? '当前无符合条件的标的' : '等待历史库就绪'} />
          </div>
          <div className="panel">
            <h3>缩量回踩 · 近10日强势 + 回踩MA5/MA10±2.5% + 缩量至5日均量85%以下</h3>
            <ScanTable rows={data?.huita || []} onWatch={onWatch} onOpenStock={onOpenStock} emptyText={historyReady ? '当前无符合条件的标的' : '等待历史库就绪'} />
          </div>
        </>
      )}

      {section === 'reflow' && (
        <div className="panel">
          <h3>回流候选 · 题材龙头断板1~3天 + 缩量回调 + 守住MA10（次日竞价高开=回流确认）</h3>
          <table className="tbl">
            <thead>
              <tr><th>评分</th><th>名称</th><th>现价</th><th>涨幅</th><th>断板</th><th>昨日高度</th><th>量能倍数</th><th>命中点</th><th></th></tr>
            </thead>
            <tbody>
              {(data?.reflow || []).length === 0 && (
                <tr><td colSpan={9} className="empty">{historyReady ? '当前无回流候选（或历史库刚就绪，等下一轮扫描）' : '等待历史库就绪'}</td></tr>
              )}
              {(data?.reflow || []).map((s) => (
                <tr key={s.code}>
                  <td><span className={`lb ${s.score >= 75 ? 'lb-high' : ''}`}>{s.score}</span></td>
                  <td className="name"><span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}<small>{s.code}</small></span></td>
                  <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>
                  <td className={`bold ${pctCls(s.pct)}`}>{fmtPct(s.pct)}</td>
                  <td>第 {s.gapDays} 天</td>
                  <td>{s.prevLianban ? s.prevLianban + '板' : '-'}</td>
                  <td>{s.volTimes != null ? s.volTimes + '×' : '-'}</td>
                  <td className="muted reasons-cell">{(s.reasons || []).join(' · ')}</td>
                  <td><button className="mini" onClick={() => onWatch(s.code, s.name)}>+自选</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
