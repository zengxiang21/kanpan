// 纯 SVG 分时图：价格线 + 均价线 + 昨收虚线 + 分钟量柱，15 秒自动刷新
import { useEffect, useState } from 'react';

export default function MinuteChart({ code, name }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const d = await (await fetch('/api/minute?code=' + code)).json();
        if (!stop) {
          if (d.error) setErr(d.error);
          else { setData(d); setErr(null); }
        }
      } catch (e) {
        if (!stop) setErr(e.message);
      }
    };
    load();
    const t = setInterval(load, 15_000);
    return () => { stop = true; clearInterval(t); };
  }, [code]);

  if (err) return <div className="empty">分时加载失败：{err}</div>;
  if (!data) return <div className="empty">分时加载中…</div>;

  const pts = data.points;
  const prevClose = data.prevClose;
  const W = 720, H = 260, PADL = 46, PADR = 10, PADT = 10, VH = 60;
  const chartH = H - VH - 18;
  const prices = pts.map((p) => p.price).concat(pts.map((p) => p.avg)).concat(prevClose ? [prevClose] : []);
  let hi = Math.max(...prices), lo = Math.max(0.01, Math.min(...prices));
  const pad = (hi - lo) * 0.08 || hi * 0.002;
  hi += pad; lo -= pad;
  const x = (i) => PADL + (i / (pts.length - 1 || 1)) * (W - PADL - PADR);
  const y = (p) => PADT + (1 - (p - lo) / (hi - lo)) * (chartH - PADT);
  const line = (key) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const maxVol = Math.max(1, ...pts.map((p) => p.vol));
  const last = pts.at(-1);
  const up = prevClose && last.price >= prevClose;
  const color = up ? 'var(--up)' : 'var(--down)';

  const gridVals = [hi, prevClose || lo, lo];

  return (
    <div className="minute-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="minute-svg">
        {/* 网格与刻度 */}
        {[0, 0.5, 1].map((f, i) => {
          const v = lo + (hi - lo) * (1 - f);
          const yy = PADT + f * (chartH - PADT);
          return (
            <g key={i}>
              <line x1={PADL} x2={W - PADR} y1={yy} y2={yy} stroke="#21262d" />
              <text x={4} y={yy + 4} fontSize="10" fill="#8b949e">{v.toFixed(2)}</text>
            </g>
          );
        })}
        {/* 昨收虚线 */}
        {prevClose && (
          <line x1={PADL} x2={W - PADR} y1={y(prevClose)} y2={y(prevClose)} stroke="#8b949e" strokeDasharray="4 4" strokeOpacity="0.6" />
        )}
        {/* 量柱 */}
        {pts.map((p, i) => {
          const h = (p.vol / maxVol) * (VH - 8);
          const bx = x(i) - (W - PADL - PADR) / pts.length / 2;
          const bw = Math.max(1, (W - PADL - PADR) / pts.length - 1);
          return <rect key={i} x={bx} y={H - 6 - h} width={bw} height={h} fill={p.price >= p.avg ? '#ff525255' : '#2ecc8f55'} />;
        })}
        {/* 均价线 + 价格线 */}
        <path d={line('avg')} fill="none" stroke="#e3b341" strokeWidth="1.2" />
        <path d={line('price')} fill="none" stroke={color} strokeWidth="1.6" />
        {/* 时间轴 */}
        {['0930', '1030', '1130', '1400', '1500'].map((tt) => {
          const idx = pts.findIndex((p) => p.t === tt);
          if (idx < 0) return null;
          return <text key={tt} x={x(idx)} y={H - 16} fontSize="10" fill="#8b949e" textAnchor="middle">{tt.slice(0, 2)}:{tt.slice(2)}</text>;
        })}
      </svg>
      <div className="minute-legend">
        <span>{name || data.code} {data.date}</span>
        <span className="muted">昨收 {prevClose}</span>
        <span className={up ? 'up' : 'down'}>最新 {last.price}</span>
        <span style={{ color: '#e3b341' }}>均价 {last.avg}</span>
        <span className="muted">15秒自动刷新</span>
      </div>
    </div>
  );
}
