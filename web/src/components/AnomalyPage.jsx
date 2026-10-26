// 异动监控：基于 SSE tick 流做逐帧对比（涨幅榜/量比榜/成交额榜 + 自选股），捕捉急拉/跳水
import { useEffect, useRef, useState } from 'react';
import { fmtPrice, fmtPct, pctCls } from '../lib/format.js';

const DELTA = 1.5; // 相邻两帧涨跌幅变化阈值（3秒内）

function notify(title, body) {
  try {
    if (localStorage.getItem('notify-on') === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, silent: false });
    }
  } catch { /* 通知失败不影响页面 */ }
}

export default function AnomalyPage({ tick, watch, pools, onOpenStock }) {
  const prevRef = useRef(null);   // code -> pct
  const [events, setEvents] = useState([]);
  const [notifyOn, setNotifyOn] = useState(() => localStorage.getItem('notify-on') === '1');
  const prevZbRef = useRef(null); // 炸板池 code 集合

  // 炸板即时提醒：新进炸板池的票
  useEffect(() => {
    const zb = pools?.zb || [];
    const codes = new Set(zb.map((s) => s.code));
    const prev = prevZbRef.current;
    prevZbRef.current = codes;
    if (!prev) return;
    const fresh = zb.filter((s) => !prev.has(s.code));
    if (fresh.length) {
      const now = Date.now();
      const evts = fresh.map((s) => ({
        id: now + '-zb-' + s.code, time: now, code: s.code, name: s.name,
        price: s.price, from: null, to: s.pct, delta: null, type: '炸板',
      }));
      setEvents((e) => [...evts, ...e].slice(0, 120));
      for (const s of fresh) notify(`⚠ 炸板：${s.name}`, `首次封板时间 ${s.firstSeal || '-'} · 现价 ${s.price}`);
    }
  }, [pools]);

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
      notify('✅ 异动通知已开启', '急拉/跳水/炸板会推送浏览器通知');
    } catch {
      localStorage.setItem('notify-on', '1');
      setNotifyOn(true);
    }
  };

  // 从 SSE tick 的三张榜单里提取个股 pct 做对比
  useEffect(() => {
    if (!tick) return;
    const cur = new Map();
    for (const s of [...(tick.gainers || []), ...(tick.volRatio || []), ...(tick.amountTop || [])]) {
      if (Number.isFinite(s.pct)) cur.set(s.code, { name: s.name, pct: s.pct, price: s.price });
    }
    const prev = prevRef.current;
    prevRef.current = cur;
    if (!prev) return;
    const fresh = [];
    const now = Date.now();
    for (const [code, info] of cur) {
      const p = prev.get(code);
      if (!p) continue;
      const d = info.pct - p.pct;
      if (Math.abs(d) >= DELTA) {
        fresh.push({
          id: now + '-' + code,
          time: now, code, name: info.name, price: info.price,
          from: p.pct, to: info.pct, delta: +d.toFixed(2),
          type: d > 0 ? '急拉' : '跳水',
        });
      }
    }
    if (fresh.length) {
      setEvents((e) => [...fresh, ...e].slice(0, 120));
      for (const ev of fresh) {
        if (Math.abs(ev.delta) >= 2.5) notify(`${ev.type === '急拉' ? '🔥' : '💧'} ${ev.name} ${ev.type}`, `${ev.from.toFixed(1)}% → ${ev.to.toFixed(1)}%`);
      }
    }
  }, [tick]);

  // 自选股单独 3 秒轮询对比（覆盖不在榜单里的票）
  const watchPrev = useRef(null);
  const codes = (watch || []).map((x) => x.code).join(',');
  useEffect(() => {
    if (!codes) return;
    const t = setInterval(async () => {
      try {
        const rows = await (await fetch('/api/quotes?codes=' + codes)).json();
        const prev = watchPrev.current;
        watchPrev.current = new Map(rows.map((r) => [r.code, r]));
        if (!prev) return;
        const now = Date.now();
        const fresh = [];
        for (const r of rows) {
          const p = prev.get(r.code);
          if (!p || !Number.isFinite(r.pct) || !Number.isFinite(p.pct)) continue;
          const d = r.pct - p.pct;
          if (Math.abs(d) >= DELTA) {
            fresh.push({
              id: now + '-w-' + r.code, time: now, code: r.code, name: r.name, price: r.price,
              from: p.pct, to: r.pct, delta: +d.toFixed(2),
              type: d > 0 ? '急拉' : '跳水', watch: true,
            });
          }
        }
        if (fresh.length) setEvents((e) => [...fresh, ...e].slice(0, 120));
      } catch { /* 忽略 */ }
    }, 3000);
    return () => clearInterval(t);
  }, [codes]);

  return (
    <div className="page">
      <h2 className="page-title">
        异动监控
        <span className="page-tag">3 秒级帧对比 · 阈值 ±{DELTA}%</span>
        <button className={`mini ${notifyOn ? 'active-mini' : ''}`} onClick={toggleNotify}>
          {notifyOn ? '🔔 通知已开' : '🔕 开启浏览器通知'}
        </button>
      </h2>
      <div className="hint" style={{ marginBottom: 10 }}>
        监控范围：涨幅榜/量比榜/成交额榜前 50 + 自选股 + 涨停池炸板事件。急拉=短时放量上攻（打板/半路信号），跳水=承接失败（持仓警戒）。
      </div>
      <table className="tbl">
        <thead>
          <tr><th>时间</th><th>类型</th><th>名称</th><th>现价</th><th>涨幅变化</th><th>当前涨幅</th><th></th></tr>
        </thead>
        <tbody>
          {events.length === 0 && <tr><td colSpan={7} className="empty">暂无异动 —— 交易时段 3 秒一帧，出现快速拉升/跳水会立即出现在这里</td></tr>}
          {events.map((e) => (
            <tr key={e.id} className={e.type === '急拉' ? 'row-up' : 'row-down'}>
              <td className="muted">{new Date(e.time).toLocaleTimeString('zh-CN', { hour12: false })}</td>
              <td><span className={`lb ${e.type === '急拉' ? 'lb-high' : 'lb-green'}`}>{e.type}{e.watch ? '·自选' : ''}</span></td>
              <td className="name"><span className="name-link" onClick={() => onOpenStock(e.code, e.name)}>{e.name}<small>{e.code}</small></span></td>
              <td>{fmtPrice(e.price)}</td>
              <td className={pctCls(e.delta)}>{e.from != null ? `${e.from.toFixed(1)}% → ${e.to.toFixed(1)}%` : '涨停→炸板'}</td>
              <td className={`bold ${pctCls(e.to)}`}>{fmtPct(e.to)}</td>
              <td className="muted">{Math.abs(e.delta) >= 3 ? '强异动' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
