// 异动监控：基于 SSE tick 流做逐帧对比（涨幅榜/量比榜/成交额榜 + 自选股），捕捉急拉/跳水
import { useEffect, useRef, useState } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtAmount } from '../lib/format.js';
import { api, CLOUD } from '../lib/api.js';

// 类型 → 徽章配色（复用 .lb 系）
const TYPE_LB = {
  急拉: 'lb-high', 跳水: 'lb-green', 触板: 'lb-high', 跌停: 'lb-green',
  炸板: 'lb-warn', 封单骤减: 'lb-warn',
};

function fmtInterval(ms) {
  if (ms == null) return '-';
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒`;
  return `${(ms / 60_000).toFixed(1)}分`;
}

// 实时表：数据来自服务端 /api/anomaly/today（全市场帧对比 + 落盘）
function LiveTable({ events, onOpenStock }) {
  return (
    <table className="tbl">
      <thead>
        <tr><th>时间</th><th>类型</th><th>名称</th><th>现价</th><th>变化</th><th>当前涨幅</th><th>间隔</th><th></th></tr>
      </thead>
      <tbody>
        {events.length === 0 && (
          <tr><td colSpan={8} className="empty">暂无异动 —— 服务端每轮全市场快照（5000+ 只）对比上一轮，出现急拉/跳水/触板/炸板会立即记录并持久化，刷新不丢</td></tr>
        )}
        {events.map((e) => (
          <tr key={e.t + '-' + e.code + '-' + e.type} className={e.type === '急拉' || e.type === '触板' ? 'row-up' : e.type === '跳水' || e.type === '跌停' ? 'row-down' : ''}>
            <td className="muted">{new Date(e.t).toLocaleTimeString('zh-CN', { hour12: false })}</td>
            <td><span className={`lb ${TYPE_LB[e.type] || ''}`}>{e.type}</span></td>
            <td className="name"><span className="name-link" onClick={() => onOpenStock(e.code, e.name)}>{e.name}<small>{e.code}</small></span></td>
            <td>{fmtPrice(e.price)}</td>
            <td className={pctCls(e.delta)}>
              {e.from != null && e.to != null ? `${e.from}% → ${e.to}%` : (e.type === '炸板' ? '涨停→炸板' : `封单 ${e.sealBefore}亿 → ${e.sealNow}亿`)}
            </td>
            <td className={`bold ${pctCls(e.to)}`}>{e.to != null ? fmtPct(e.to) : '-'}</td>
            <td className="muted">{fmtInterval(e.intervalMs)}</td>
            <td className="muted">{e.delta != null && Math.abs(e.delta) >= 3 ? '强异动' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const DELTA = 1.5; // 相邻两帧涨跌幅变化阈值（3秒内）

function notify(title, body) {
  try {
    if (localStorage.getItem('notify-on') === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, silent: false });
    }
  } catch { /* 通知失败不影响页面 */ }
}

// 复盘面板：某日异动聚合，输出"第二天能用"的结论
function ReviewPanel({ date, onOpenStock }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    let stop = false;
    api('anomaly/review?date=' + date).then((d) => { if (!stop) setR(d); }).catch(() => {});
    return () => { stop = true; };
  }, [date]);

  if (!r) return <div className="empty">加载中…</div>;
  if (!r.total) return <div className="empty">该日无异动记录</div>;

  const maxHour = Math.max(...r.byHour.map((h) => h.count), 1);

  return (
    <>
      <div className="cards" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="k">异动总数</div>
          <div className="v">{r.total}</div>
          <div className="note">{r.date}</div>
        </div>
        {Object.entries(r.byType).map(([t, n]) => (
          <div className="card" key={t}>
            <div className="k">{t}</div>
            <div className="v">{n}</div>
            <div className="note">次</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>异动时段分布（北京时间）</h3>
        <div className="bars">
          {r.byHour.map((h) => (
            <div className="bar-row" key={h.hour}>
              <span className="bar-label">{h.hour}时</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(h.count / maxHour) * 100}%` }}><em>{h.count}</em></div>
              </div>
            </div>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>开盘后首小时与尾盘半小时通常是异动高发段——前者定方向，后者决过夜。</div>
      </div>

      <div className="panel">
        <h3>强异动 Top（同一只票只留波动最大的一次）<span className="muted" style={{ fontSize: 11, fontWeight: 'normal', marginLeft: 8 }}>|波动|≥3% 标强</span></h3>
        <table className="tbl compact">
          <thead><tr><th>时间</th><th>类型</th><th>名称</th><th>现价</th><th>波动</th><th>从→到</th></tr></thead>
          <tbody>
            {r.topMovers.map((m) => (
              <tr key={m.code} className={m.type === '急拉' ? 'row-up' : 'row-down'}>
                <td className="muted">{new Date(m.time).toLocaleTimeString('zh-CN', { hour12: false })}</td>
                <td><span className={`lb ${TYPE_LB[m.type] || ''}`}>{m.type}</span></td>
                <td className="name"><span className="name-link" onClick={() => onOpenStock(m.code, m.name)}>{m.name}<small>{m.code}</small></span></td>
                <td>{fmtPrice(m.price)}</td>
                <td className={`bold ${pctCls(m.delta)}`}>{m.delta > 0 ? '+' : ''}{m.delta}%</td>
                <td className="muted">{m.from}% → {m.to}%{m.strong && <em className="lb lb-warn" style={{ marginLeft: 6 }}>强</em>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.zhaTop.length > 0 && (
        <div className="panel">
          <h3>炸板记录（打板排单的教训）</h3>
          <table className="tbl compact">
            <thead><tr><th>时间</th><th>名称</th><th>现价</th><th>首封</th><th>炸板次数</th></tr></thead>
            <tbody>
              {r.zhaTop.map((z) => (
                <tr key={z.time + '-' + z.code}>
                  <td className="muted">{new Date(z.time).toLocaleTimeString('zh-CN', { hour12: false })}</td>
                  <td className="name"><span className="name-link" onClick={() => onOpenStock(z.code, z.name)}>{z.name}<small>{z.code}</small></span></td>
                  <td className={pctCls(z.pct)}>{fmtPct(z.pct)}</td>
                  <td className="muted">{z.firstSeal || '-'}</td>
                  <td className="warn">{z.zhaCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.sealDrop.length > 0 && (
        <div className="panel">
          <h3>封单骤减（撤单预警）</h3>
          <table className="tbl compact">
            <thead><tr><th>时间</th><th>名称</th><th>封单变化</th><th>现价</th></tr></thead>
            <tbody>
              {r.sealDrop.map((s) => (
                <tr key={s.time + '-' + s.code}>
                  <td className="muted">{new Date(s.time).toLocaleTimeString('zh-CN', { hour12: false })}</td>
                  <td className="name"><span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}<small>{s.code}</small></span></td>
                  <td className="warn">{s.sealBefore}亿 → {s.sealNow}亿</td>
                  <td className={pctCls(s.pct)}>{s.pct != null ? fmtPct(s.pct) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="hint">{r.note}</div>
    </>
  );
}

export default function AnomalyPage({ tick, watch, pools, onOpenStock }) {
  const [tab, setTab] = useState('live');
  const [events, setEvents] = useState([]);
  const [dates, setDates] = useState([]);
  const [reviewDate, setReviewDate] = useState('');
  const [notifyOn, setNotifyOn] = useState(() => localStorage.getItem('notify-on') === '1');
  const seenRef = useRef(new Set()); // 已通知过的 key，避免重复推送

  // 当日异动：读服务端持久化数据（服务端每轮 sweep 都会写盘），5 秒拉一次
  useEffect(() => {
    let stop = false;
    const load = () => {
      api('anomaly/today').then((d) => {
        if (stop || !d) return;
        setEvents(d.events || []);
        // 强异动 / 炸板 / 封单骤减 推送浏览器通知（只推没推过的）
        for (const e of (d.events || []).slice(0, 20)) {
          const key = e.t + '-' + e.code + '-' + e.type;
          if (seenRef.current.has(key)) continue;
          seenRef.current.add(key);
          if (e.delta != null && Math.abs(e.delta) >= 3) {
            notify(`${e.type === '急拉' ? '🔥' : '💧'} ${e.name} ${e.type}`, `${e.from}% → ${e.to}%`);
          } else if (e.type === '炸板') {
            notify(`⚠ 炸板：${e.name}`, `首封 ${e.firstSeal || '-'} · 现价 ${e.price}`);
          } else if (e.type === '封单骤减') {
            notify(`⚠ 封单骤减：${e.name}`, `封单 ${e.sealBefore}亿 → ${e.sealNow}亿`);
          }
        }
      }).catch(() => {});
    };
    load();
    if (CLOUD) return () => { stop = true; };
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  // 有异动记录的日期列表（复盘 tab 用）
  useEffect(() => {
    api('anomaly/dates').then((d) => {
      if (!Array.isArray(d) || !d.length) return;
      setDates(d);
      setReviewDate((cur) => cur || d[0]);
    }).catch(() => {});
  }, []);

  const toggleNotify = async () => {
    if (notifyOn) {
      localStorage.setItem('notify-on', '0');
      setNotifyOn(false);
      return;
    }
    try {
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }
      localStorage.setItem('notify-on', '1');
      setNotifyOn(true);
      notify('✅ 异动通知已开启', '强异动/炸板/封单骤减会推送浏览器通知');
    } catch {
      localStorage.setItem('notify-on', '1');
      setNotifyOn(true);
    }
  };


  return (
    <div className="page">
      <h2 className="page-title">
        异动监控
        <span className="page-tag">服务端全市场帧对比 · 5000+ 只 · 持久化</span>
        <button className={`mini ${notifyOn ? 'active-mini' : ''}`} onClick={toggleNotify}>
          {notifyOn ? '🔔 通知已开' : '🔕 开启浏览器通知'}
        </button>
        <span className="flex-sp" />
        <button className={`mini ${tab === 'live' ? 'active-mini' : ''}`} onClick={() => setTab('live')}>实时监控</button>
        <button className={`mini ${tab === 'review' ? 'active-mini' : ''}`} onClick={() => setTab('review')}>盘中异动复盘</button>
      </h2>

      <div className="hint" style={{ marginBottom: 10 }}>
        监控范围：全市场 5000+ 只（新浪分页扫描）+ 东财涨停/炸板池。急拉/跳水=相邻两轮涨跌幅变化≥1.5%，触板/跌停=本轮新达到，炸板与封单骤减来自涨停池。所有事件落盘 server/data/anomaly/，刷新不丢、可复盘。
      </div>

      {tab === 'live' ? (
        <LiveTable events={events} onOpenStock={onOpenStock} />
      ) : (
        <>
          <div className="toolbar">
            <span className="hint">选择日期</span>
            <select className="date-select" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)}>
              {dates.length === 0 && <option value="">无异动记录</option>}
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="hint">复盘昨日盘中异动，为第二天短线定方向：强异动是否集中在某一题材、炸板集中在什么位置、哪些票被撤单</span>
          </div>
          {reviewDate ? <ReviewPanel date={reviewDate} onOpenStock={onOpenStock} /> : <div className="empty">暂无记录</div>}
        </>
      )}
    </div>
  );
}
