// 板块轮动：新浪行业板块实时涨跌 + 领涨股 + 题材涨停数（东财涨停池口径）
import { useEffect, useState } from 'react';
import { fmtPct, pctCls, fmtAmount } from '../lib/format.js';
import { api, CLOUD } from '../lib/api.js';

export default function SectorsPage({ pools }) {
  const [sectors, setSectors] = useState([]);
  const [openTheme, setOpenTheme] = useState(null);
  const [err, setErr] = useState(null);
  const [at, setAt] = useState(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const d = await api('sectors');
        if (!stop) {
          if (d.error) setErr(d.error);
          else { setErr(null); setSectors(d); setAt(Date.now()); }
        }
      } catch { /* 下轮重试 */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  // 题材涨停数（涨停池行业口径）
  const themeMap = new Map();
  for (const z of pools?.zt || []) {
    if (!z.industry) continue;
    const g = themeMap.get(z.industry) || { industry: z.industry, count: 0, top: z.name, lianban: 0 };
    g.count++;
    if ((z.lianban || 1) > g.lianban) { g.lianban = z.lianban; g.top = z.name; }
    themeMap.set(z.industry, g);
  }
  const themes = [...themeMap.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  const up = sectors.filter((s) => s.pct > 0).length;

  return (
    <div className="page">
      <h2 className="page-title">
        板块轮动
        <span className="page-tag">30 秒刷新 {at ? '· ' + new Date(at).toLocaleTimeString('zh-CN', { hour12: false }) : ''}</span>
      </h2>
      <div className="hint" style={{ marginBottom: 10 }}>
        {err ? `加载失败：${err}（30秒后自动重试）` : `共 ${sectors.length} 个行业板块，上涨 ${up} 个 · 轮动方向看排名迁移，主线 = 连续 2 天进前 10 且涨停家数 ≥3`}
      </div>

      <div className="row2">
        <div className="panel">
          <h3>行业涨幅榜 Top15（新浪口径 · 实时）</h3>
          <table className="tbl compact">
            <thead><tr><th>板块</th><th>涨幅</th><th>家数</th><th>成交额</th><th>领涨股</th></tr></thead>
            <tbody>
              {sectors.slice(0, 15).map((s) => (
                <tr key={s.code}>
                  <td className="name">{s.name}</td>
                  <td className={`bold ${pctCls(s.pct)}`}>{fmtPct(s.pct)}</td>
                  <td>{s.count}</td>
                  <td>{fmtAmount(s.amount)}</td>
                  <td className="muted">{s.leader} {fmtPct(s.leaderPct)}</td>
                </tr>
              ))}
              {sectors.length === 0 && <tr><td colSpan={5} className="empty">加载中…</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>行业跌幅榜 Top10（防补跌）</h3>
          <table className="tbl compact">
            <thead><tr><th>板块</th><th>涨幅</th><th>领涨股</th></tr></thead>
            <tbody>
              {sectors.slice(-10).reverse().map((s) => (
                <tr key={s.code}>
                  <td className="name">{s.name}</td>
                  <td className={`bold ${pctCls(s.pct)}`}>{fmtPct(s.pct)}</td>
                  <td className="muted">{s.leader}</td>
                </tr>
              ))}
              {sectors.length === 0 && <tr><td colSpan={3} className="empty">加载中…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>题材涨停热度（涨停池行业口径 · 只统计已涨停）</h3>
        <div className="tianti-stocks">
          {themes.map((t) => (
            <button className="us-card dir-btn" key={t.industry} onClick={() => setOpenTheme(openTheme === t.industry ? null : t.industry)} title="点击展开该题材涨停股">
              <div className="us-head"><b>{t.industry}</b><span className="up bold">{t.count} 家</span></div>
              <div className="muted" style={{ fontSize: 11 }}>最高 {t.lianban}板 · {t.top}</div>
              {openTheme === t.industry && (
                <div style={{ marginTop: 6, textAlign: 'left' }}>
                  {(pools?.zt || []).filter((z) => z.industry === t.industry).map((z) => (
                    <div key={z.code} style={{ fontSize: 12 }}>{z.lianban > 1 ? z.lianban + '板·' : ''}{z.name} <span className="muted">{z.firstSeal || ''}</span></div>
                  ))}
                </div>
              )}
            </button>
          ))}
          {themes.length === 0 && <div className="empty">暂无涨停数据</div>}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>两个榜单交叉看：行业涨幅榜靠前 + 涨停家数多 = 真主线；涨幅高但涨停少 = 权重拉动，不动</div>
      </div>
    </div>
  );
}
