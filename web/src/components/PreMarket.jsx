// 盘前决策页：开仓环境评分卡 + 昨日涨停溢价/晋级率 + 隔夜外围 + 7×24 快讯
import { useEffect, useState } from 'react';
import { fmtAmount, fmtTime } from '../lib/format.js';

// 美股/外围方向 → A股概念 映射（人工维护，JSON 化后续做设置页）
const GLOBAL_MAP = {
  纳斯达克: '科技/成长风格风向标',
  道琼斯: '权重/价值风格',
  标普指数: '全球风险偏好',
  恒生指数: '港股联动 · 中概情绪',
  日经指数: '亚太风险偏好',
  富时A50期货: 'A股开盘前最重要先行指标',
};

export default function PreMarket({ tick }) {
  const [global, setGlobal] = useState([]);
  const [news, setNews] = useState([]);

  useEffect(() => {
    const load = () => {
      fetch('/api/global').then((r) => r.json()).then((d) => Array.isArray(d) && setGlobal(d)).catch(() => {});
      fetch('/api/news').then((r) => r.json()).then((d) => Array.isArray(d) && setNews(d)).catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const env = tick?.env;
  const prem = tick?.premium;
  const jinji = tick?.jinji || [];

  return (
    <div className="page">
      <h2 className="page-title">盘前决策 · 今天能不能出手</h2>

      <div className="cards">
        <div className="card env-card">
          <div className="k">开仓环境评分</div>
          <div className="v env-big">{env ? env.total : '-'}</div>
          <div className={`v label ${env?.label === '重仓出击' ? 'lab-hot' : env?.label === '轻仓试错' ? 'lab-warm' : env?.label === '只看低吸' ? 'lab-cool' : 'lab-freeze'}`}>
            {env?.label || '…'}
          </div>
          <div className="note">{env?.advice || '等待数据'}</div>
        </div>
        <div className="card wide-card">
          <div className="k">评分构成</div>
          {env ? (
            <div className="env-parts">
              {env.parts.map((p) => (
                <div className="env-part" key={p.name}>
                  <div className="env-part-head">
                    <span>{p.name}</span>
                    <span className="muted">{p.score}/{p.weight}</span>
                  </div>
                  <div className="bar-track slim">
                    <div className="bar-fill" style={{ width: `${(p.score / p.weight) * 100}%` }} />
                  </div>
                  <div className="note">{p.note}</div>
                </div>
              ))}
            </div>
          ) : <div className="empty">等待行情数据…</div>}
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="k">昨日涨停溢价</div>
          <div className={`v ${prem ? (prem.avg > 0 ? 'up' : 'down') : ''}`}>{prem ? (prem.avg > 0 ? '+' : '') + prem.avg + '%' : '-'}</div>
          <div className="note">{prem ? `${prem.count} 只 · 中位 ${prem.median}% · 翻红率 ${prem.redRate}%` : '待今日开盘（开盘后 = 昨日涨停股的今日表现）'}</div>
        </div>
        <div className="card">
          <div className="k">连板晋级率</div>
          <div className="v jinji-line">
            {jinji.length ? jinji.map((j) => (
              <span key={j.from} className="jinji-item">{j.from}进{j.to} <b className={j.rate >= 40 ? 'up' : j.rate >= 20 ? '' : 'down'}>{j.rate}%</b></span>
            )) : '-'}
          </div>
          <div className="note">晋级率高=情绪接力意愿强</div>
        </div>
        <div className="card">
          <div className="k">情绪快照</div>
          <div className="v">{tick?.emotionLabel || '-'}</div>
          <div className="note">{tick ? `涨停 ${tick.ztCount} · 炸板 ${tick.zbCount} · 最高 ${tick.maxLianban} 板` : ''}</div>
        </div>
      </div>

      <div className="row2">
        <div className="panel">
          <h3>隔夜外围 · 方向映射</h3>
          <table className="tbl compact">
            <thead><tr><th>市场</th><th>最新</th><th>涨跌</th><th>对 A 股的方向含义</th></tr></thead>
            <tbody>
              {global.map((g) => (
                <tr key={g.key}>
                  <td className="name">{g.name}</td>
                  <td className={g.pct > 0 ? 'up' : g.pct < 0 ? 'down' : ''}>{g.price}</td>
                  <td className={g.pct > 0 ? 'up' : g.pct < 0 ? 'down' : ''}>{g.pct > 0 ? '+' : ''}{g.pct}%</td>
                  <td className="muted">{GLOBAL_MAP[g.name] || ''}</td>
                </tr>
              ))}
              {global.length === 0 && <tr><td colSpan={4} className="empty">加载中…</td></tr>}
            </tbody>
          </table>
          <div className="hint">A50 期货是最直接的 A 股开盘先行指标；隔夜大涨方向 = 今日高开预期方向（竞价雷达里验证）</div>
        </div>
        <div className="panel">
          <h3>7×24 快讯 · 舆论方向</h3>
          <div className="news-list">
            {news.slice(0, 20).map((n, i) => (
              <div className="news-item" key={i}>
                <span className="news-time">{n.time ? fmtTime(n.time) : ''}</span>
                <a className="news-title" href={n.url || '#'} target="_blank" rel="noreferrer">{n.title}</a>
              </div>
            ))}
            {news.length === 0 && <div className="empty">加载中…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
