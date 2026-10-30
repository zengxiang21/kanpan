// 杠杆与流动性：两融余额 + 爆仓风险 + 美债收益率
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtPct, pctCls } from '../lib/format.js';

// 简易 SVG 折线（两融余额 / 美债10Y 趋势复用）
function Sparkline({ points, height = 56, color = 'var(--accent)' }) {
  if (!points || points.length < 2) return <div className="muted" style={{ fontSize: 12 }}>暂无趋势数据</div>;
  const vals = points.map((p) => p[1]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 300;
  const H = height;
  const step = W / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - ((p[1] - min) / span) * (H - 6) - 3).toFixed(1)}`).join(' ');
  const area = `${d} L${W},${H} L0,${H} Z`;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={area} fill={color} opacity="0.10" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" />
      <text x={W - 2} y={11} textAnchor="end" fontSize="11" fill="var(--muted)">{last[1]}</text>
    </svg>
  );
}

function PctBar({ pct, label }) {
  if (pct == null) return <span className="muted">-</span>;
  const cls = pct >= 90 ? 'up' : pct >= 70 ? 'warn' : pct >= 30 ? '' : 'down';
  return (
    <span className={cls} style={{ fontWeight: 600 }}>
      {pct}%{label ? ` · ${label}` : ''}
    </span>
  );
}

export default function LiquidityPage() {
  const [margin, setMargin] = useState(null);
  const [liq, setLiq] = useState(null);
  const [tsy, setTsy] = useState(null);

  useEffect(() => {
    const load = () => {
      api('margin').then((d) => d && !d.error && setMargin(d)).catch(() => {});
      api('liquidation').then((d) => d && !d.error && setLiq(d)).catch(() => {});
      api('treasury?limit=120').then((d) => d && !d.error && setTsy(d)).catch(() => {});
    };
    load();
    // 这三个都是低频数据（两融 T+1、美债日频），不需要快刷
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="page">
      <h2 className="page-title">杠杆与流动性 · 两融 / 爆仓压力 / 美债</h2>

      {/* ============ 两融余额 ============ */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>
          两融余额（融资融券）
          <span className="page-tag">杠杆水位</span>
        </h3>
        {!margin ? <div className="empty">加载中…</div> : (
          <>
            <div className="cards">
              <div className="card">
                <div className="k">融资余额</div>
                <div className="v">{margin.balanceWanYi}<small className="muted" style={{ fontSize: 13 }}> 万亿</small></div>
                <div className="note">{margin.date} · 流通市值 {margin.floatCapWanYi} 万亿</div>
              </div>
              <div className="card">
                <div className="k">杠杆水位（融资余额/流通市值）</div>
                <div className="v">{margin.ratio}<small className="muted" style={{ fontSize: 13 }}> %</small></div>
                <div className="note">
                  历史百分位 <PctBar pct={margin.pctAll} label={margin.level?.label} />
                </div>
              </div>
              <div className="card">
                <div className="k">融资净买入</div>
                <div className={`v ${margin.netBuy >= 0 ? 'up' : 'down'}`}>{margin.netBuyYi}<small className="muted" style={{ fontSize: 13 }}> 亿</small></div>
                <div className="note">连续净流出 {margin.negStreak} 日</div>
              </div>
              <div className="card">
                <div className="k">融资余额 5 日变化</div>
                <div className={`v ${margin.chg5d >= 0 ? 'up' : 'down'}`}>{margin.chg5d != null ? `${margin.chg5d > 0 ? '+' : ''}${margin.chg5d}%` : '-'}</div>
                <div className="note">负值=去杠杆进行中</div>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>融资余额趋势（近 {margin.trend?.length || 0} 个交易日，单位 亿元）</div>
              <Sparkline points={margin.trend} />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>{margin.note}</div>
          </>
        )}
      </div>

      {/* ============ 爆仓风险 ============ */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>
          机构爆仓风险
          <span className="page-tag">市场层面强平压力</span>
        </h3>
        {!liq ? <div className="empty">加载中…</div> : (
          <>
            <div className="cards">
              <div className="card">
                <div className="k">爆仓压力评分</div>
                <div className={`v ${liq.level?.cls || ''}`}>{liq.score}<small className="muted" style={{ fontSize: 13 }}> / 100</small></div>
                <div className="note">{liq.level?.label}</div>
              </div>
              <div className="card">
                <div className="k">因子1 杠杆水位百分位</div>
                <div className="v"><PctBar pct={liq.factors?.leveragePct} /></div>
                <div className="note">基于近 {liq.factors?.leverageSamples} 个交易日 · 权重 50</div>
              </div>
              <div className="card">
                <div className="k">因子2 融资重仓股强平信号</div>
                <div className="v">
                  {liq.factors?.heavyAvgPct != null
                    ? <span className={pctCls(liq.factors.heavyAvgPct)}>均幅 {liq.factors.heavyAvgPct}%</span>
                    : <span>偿还/买入比 {liq.factors?.heavyAvgRepayRatio ?? '-'}</span>}
                </div>
                <div className="note">
                  {liq.factors?.forcedOutCount ? `${liq.factors.forcedOutCount} 只偿还比>1.5 · ` : ''}权重 30
                </div>
              </div>
              <div className="card">
                <div className="k">因子3 去杠杆速度</div>
                <div className={`v ${(liq.factors?.balanceChg5d ?? 0) < 0 ? 'down' : 'up'}`}>
                  {liq.factors?.balanceChg5d != null ? `${liq.factors.balanceChg5d}%` : '-'}
                </div>
                <div className="note">融资余额 5 日变化 · 权重 20</div>
              </div>
            </div>

            <div className="panel" style={{ background: 'var(--panel2)', marginTop: 10 }}>
              <h3>对投资的影响</h3>
              <ul className="tp-risk">
                {(liq.impacts || []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>

            {liq.heavyStocks?.length > 0 && (
              <table className="tbl compact" style={{ marginTop: 10 }}>
                <thead><tr><th>名称</th><th>融资余额</th><th>占流通比</th><th>偿还/买入比</th><th>净买入</th><th>当日涨跌</th></tr></thead>
                <tbody>
                  {liq.heavyStocks.map((h) => (
                    <tr key={h.code} className={h.pressure === 'critical' ? 'row-today' : ''}>
                      <td className="name">{h.name}<small>{h.code}</small></td>
                      <td>{h.marginYi} 亿</td>
                      <td className={h.ratio >= 5 ? 'warn' : ''}>{h.ratio}%</td>
                      <td className={(h.repayRatio ?? 0) >= 1.5 ? 'up' : ''}>{h.repayRatio ?? '-'}</td>
                      <td className={h.netYi >= 0 ? 'up' : 'down'}>{h.netYi != null ? `${h.netYi} 亿` : '-'}</td>
                      <td className={pctCls(h.pct)}>{h.pct != null ? fmtPct(h.pct) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="hint" style={{ marginTop: 8 }}>
              {liq.note}
              <br />
              <span className="muted">
                两融明细数据日期 {liq.marginDate}（东财 T+1，非交易时段自动回退到最近有数据的一天）；行情来源 {liq.quoteSource}。
                占流通比 ≥5% 视为高杠杆筹码。维持担保比例因券商与客户而异，此处用 130% 经验值做定性判断。
              </span>
            </div>
          </>
        )}
      </div>

      {/* ============ 美债收益率 ============ */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>
          美债收益率与历史百分位
          <span className="page-tag">全球风险定价之锚</span>
        </h3>
        {!tsy ? <div className="empty">加载中…</div> : (
          <>
            <table className="tbl compact">
              <thead><tr><th>品种</th><th>最新</th><th>日变动</th><th>近1年</th><th>近3年</th><th>近10年</th><th>全历史</th><th>位置</th></tr></thead>
              <tbody>
                {(tsy.rows || []).map((r) => (
                  <tr key={r.id}>
                    <td className="name">{r.short}<small>{r.date}</small></td>
                    <td className="bold">{r.value}%</td>
                    <td className={r.change >= 0 ? 'up' : 'down'}>{r.change != null ? `${r.change > 0 ? '+' : ''}${r.change}` : '-'}</td>
                    <td><PctBar pct={r.pct1y} /></td>
                    <td><PctBar pct={r.pct3y} /></td>
                    <td><PctBar pct={r.pct10y} /></td>
                    <td className="muted">{r.pctAll}%</td>
                    <td className={r.level?.cls}>{r.level?.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {tsy.spread && (
              <div className="panel" style={{ background: 'var(--panel2)', marginTop: 10 }}>
                <h3>期限利差 10Y − 2Y</h3>
                <div style={{ fontSize: 22, fontWeight: 700 }} className={tsy.spread.inverted ? 'up' : ''}>
                  {tsy.spread.value > 0 ? '+' : ''}{tsy.spread.value}
                  <small className="muted" style={{ fontSize: 13, marginLeft: 8 }}>{tsy.spread.label}</small>
                </div>
                <div className="hint" style={{ marginTop: 4 }}>
                  {tsy.spread.note}；全历史百分位 {tsy.spread.pctAll}%。
                </div>
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>美债10Y 走势（近 {tsy.rows?.[0]?.trend?.length || 0} 个交易日）</div>
              <Sparkline points={tsy.rows?.[0]?.trend} color="var(--up)" />
            </div>

            <div className="hint" style={{ marginTop: 8 }}>
              {tsy.note}
              <br />
              <span className="muted">
                为什么看百分位而不是绝对值：4.5% 在 2023 年是高位、在 2007 年是低位，脱离历史分布单看数字会误判。
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
