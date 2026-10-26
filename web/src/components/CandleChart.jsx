// 纯 SVG 日K蜡烛图：MA5/10/20 + 量柱
import { useEffect, useState } from 'react';

function ma(closes, n) {
  return closes.map((_, i) => {
    if (i < n - 1) return null;
    let s = 0;
    for (let k = i - n + 1; k <= i; k++) s += closes[k];
    return +(s / n).toFixed(2);
  });
}

export default function CandleChart({ code, name }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [limit, setLimit] = useState(60);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const d = await (await fetch(`/api/kline?code=${code}&limit=${limit}`)).json();
        if (!stop) {
          if (d.error) setErr(d.error);
          else { setData(d.bars); setErr(null); }
        }
      } catch (e) {
        if (!stop) setErr(e.message);
      }
    })();
    return () => { stop = true; };
  }, [code, limit]);

  if (err) return <div className="empty">K线加载失败：{err}</div>;
  if (!data) return <div className="empty">K线加载中…</div>;

  const bars = data;
  const closes = bars.map((b) => b[2]);
  const ma5 = ma(closes, 5), ma10 = ma(closes, 10), ma20 = ma(closes, 20);

  const W = 760, H = 340, PADL = 48, PADR = 8, PADT = 8, VH = 70;
  const chartH = H - VH - 16;
  const n = bars.length;
  const bw = (W - PADL - 8) / n;
  const highs = bars.map((b) => b[3]), lows = bars.map((b) => b[4]);
  const hi = Math.max(...highs), lo = Math.min(...lows);
  const pad = (hi - lo) * 0.06;
  const top = hi + pad, bot = lo - pad;
  const x = (i) => PADL + i * bw + bw / 2;
  const y = (p) => PADT + (1 - (p - bot) / (top - bot)) * (chartH - PADT);
  const maxVol = Math.max(1, ...bars.map((b) => b[5]));
  const yv = (v) => H - 6 - (v / maxVol) * (VH - 6);

  const maPath = (arr, color) => arr.map((v, i) => v == null ? null : `${i === 0 || arr[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(' ');

  // 悬停：最近蜡烛的十字线 + 价格气泡
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.max(0, Math.min(n - 1, Math.floor((mx - PADL) / bw)));
    setHover(idx);
  };

  const fmtVol = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + '万手' : Math.round(v / 100) + '手');
  const hb = hover != null ? bars[hover] : null;
  const hbPct = hb && hover > 0 ? ((hb[2] / bars[hover - 1][2] - 1) * 100) : null;
  const boxW = 168, boxH = 108;
  const tipLeft = hover != null && x(hover) > W * 0.6;

  return (
    <div className="minute-wrap">
      <div className="minute-legend" style={{ paddingBottom: 6 }}>
        <span>{name || code} 日K（前复权）</span>
        <span style={{ color: '#f7a354' }}>MA5 {ma5.at(-1)}</span>
        <span style={{ color: '#58a6ff' }}>MA10 {ma10.at(-1)}</span>
        <span style={{ color: '#e3b341' }}>MA20 {ma20.at(-1)}</span>
        <span className="muted">{bars[0][0]} ~ {bars.at(-1)[0]}</span>
        <span className="flex-sp" />
        {[30, 60, 120].map((L) => (
          <button key={L} className={`mini ${limit === L ? 'active-mini' : ''}`} onClick={() => setLimit(L)}>{L}日</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="minute-svg" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const v = bot + (top - bot) * (1 - f);
          const yy = PADT + f * (chartH - PADT);
          return (
            <g key={i}>
              <line x1={PADL} x2={W - PADR} y1={yy} y2={yy} stroke="#21262d" />
              <text x={4} y={yy + 4} fontSize="10" fill="#8b949e">{v.toFixed(2)}</text>
            </g>
          );
        })}
        {/* 悬停十字线 + 价格气泡 */}
        {hb && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PADT} y2={PADT + chartH - PADT} stroke="#8b949e" strokeOpacity="0.5" strokeDasharray="3 3" />
            <line x1={PADL} x2={W - PADR} y1={y(hb[2])} y2={y(hb[2])} stroke="#8b949e" strokeOpacity="0.35" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(hb[2])} r="2.5" fill={hb[2] >= hb[1] ? '#ff5252' : '#2ecc8f'} />
            <g transform={`translate(${tipLeft ? x(hover) - boxW - 10 : x(hover) + 10}, ${PADT + 6})`}>
              <rect width={boxW} height={boxH} rx="6" fill="#0d1117" stroke="#30363d" fillOpacity="0.95" />
              <text x="10" y="18" fontSize="11" fill="#8b949e">{hb[0]}<tspan fill="#e6edf3"> {fmtVol(hb[5])}</tspan></text>
              <text x="10" y="36" fontSize="11" fill="#8b949e">开<tspan fill="#e6edf3"> {hb[1].toFixed(2)}</tspan>　高<tspan fill="#ff5252"> {hb[3].toFixed(2)}</tspan></text>
              <text x="10" y="54" fontSize="11" fill="#8b949e">低<tspan fill="#2ecc8f"> {hb[4].toFixed(2)}</tspan>　收<tspan fill={hb[2] >= hb[1] ? '#ff5252' : '#2ecc8f'} fontWeight="700"> {hb[2].toFixed(2)}</tspan></text>
              <text x="10" y="72" fontSize="11" fill="#8b949e">涨跌<tspan fill={hbPct != null && hbPct > 0 ? '#ff5252' : '#2ecc8f'} fontWeight="700"> {hbPct != null ? (hbPct > 0 ? '+' : '') + hbPct.toFixed(2) + '%' : '-'}</tspan></text>
              <text x="10" y="92" fontSize="10" fill="#8b949e">MA5 {ma5[hover] ?? '-'} · MA10 {ma10[hover] ?? '-'} · MA20 {ma20[hover] ?? '-'}</text>
            </g>
          </g>
        )}
        {bars.map((b, i) => {
          const [date, o, c, h, l] = b;
          const up = c >= o;
          const color = up ? '#ff5252' : '#2ecc8f';
          const yO = y(o), yC = y(c), yH = y(h), yL = y(l);
          const bodyTop = Math.min(yO, yC), bodyH = Math.max(1, Math.abs(yO - yC));
          return (
            <g key={date}>
              <line x1={x(i)} x2={x(i)} y1={yH} y2={yL} stroke={color} strokeWidth="1" />
              <rect x={x(i) - bw * 0.32} y={bodyTop} width={bw * 0.64} height={bodyH} fill={up ? 'transparent' : color} stroke={color} strokeWidth="1" />
              <rect x={x(i) - bw * 0.32} y={yv(b[5])} width={bw * 0.64} height={H - 6 - yv(b[5])} fill={up ? '#ff525255' : '#2ecc8f55'} />
            </g>
          );
        })}
        <path d={maPath(ma5)} fill="none" stroke="#f7a354" strokeWidth="1.2" />
        <path d={maPath(ma10)} fill="none" stroke="#58a6ff" strokeWidth="1.2" />
        <path d={maPath(ma20)} fill="none" stroke="#e3b341" strokeWidth="1.2" />
        {[0, Math.floor(n / 2), n - 1].map((i, k) => (
          <text key={k} x={x(i)} y={H - 16} fontSize="10" fill="#8b949e" textAnchor="middle">{bars[i][0].slice(5)}</text>
        ))}
      </svg>
    </div>
  );
}
