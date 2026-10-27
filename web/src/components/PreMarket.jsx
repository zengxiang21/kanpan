// 盘前决策页：开仓环境评分卡 + 昨日涨停溢价/晋级率 + 隔夜外围 + 7×24 快讯
import { useEffect, useState } from 'react';
import { fmtAmount, fmtTime, fmtPrice, fmtPct } from '../lib/format.js';
import { api, CLOUD } from '../lib/api.js';
import { useFlash } from '../lib/useFlash.js';

function UsCard({ s }) {
  const flash = useFlash(s.price);
  return (
    <div className={`us-card ${flash}`}>
      <div className="us-head">
        <b>{s.name}</b>
        <span className={s.pct > 0 ? 'up' : s.pct < 0 ? 'down' : 'muted'}>
          {s.pct != null ? (s.pct > 0 ? '+' : '') + s.pct + '%' : '-'}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>{s.price != null ? fmtPrice(s.price) : ''} · {s.map}</div>
    </div>
  );
}

function GlobalCard({ g }) {
  const flash = useFlash(g.price);
  return (
    <div className={`us-card ${flash}`}>
      <div className="us-head"><b>{g.name}</b><span className={g.pct > 0 ? 'up' : g.pct < 0 ? 'down' : 'muted'}>{g.pct > 0 ? '+' : ''}{g.pct}%</span></div>
      <div className="muted" style={{ fontSize: 11 }}>{GLOBAL_MAP[g.name] || ''} · {g.price}</div>
    </div>
  );
}

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
  const [us, setUs] = useState([]);
  const [news, setNews] = useState([]);
  const [sent, setSent] = useState(null);

  useEffect(() => {
    // 美股/全球指数 5 秒快刷（美股盘中是实时盘）；快讯/词频 60 秒
    const fast = () => {
      api('us').then((d) => Array.isArray(d) && setUs(d)).catch(() => {});
      api('global').then((d) => Array.isArray(d) && setGlobal(d)).catch(() => {});
    };
    const slow = () => {
      api('news').then((d) => Array.isArray(d) && setNews(d)).catch(() => {});
      api('sentiment').then((d) => d && d.themes && setSent(d)).catch(() => {});
    };
    fast();
    slow();
    if (CLOUD) return;
    const t1 = setInterval(fast, 5_000);
    const t2 = setInterval(slow, 60_000);
    return () => { clearInterval(t1); clearInterval(t2); };
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

      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>昨日涨停股表现明细（溢价不再只看平均）</h3>
        {tick?.premiumDetail?.length ? (
          <div className="prem-detail">
            <div>
              <div className="k" style={{ color: 'var(--up)', marginBottom: 4 }}>最强 Top8（承接最好）</div>
              {tick.premiumDetail.slice(0, 8).map((p) => (
                <div className="prem-row" key={p.code}>
                  <span className="lb">{p.lianban}板</span>
                  <b>{p.name}</b>
                  <span className="up">{fmtPct(p.pct)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="k" style={{ color: 'var(--down)', marginBottom: 4 }}>最弱 Top8（亏钱效应来源）</div>
              {tick.premiumDetail.slice(-8).reverse().map((p) => (
                <div className="prem-row" key={p.code}>
                  <span className="lb">{p.lianban}板</span>
                  <b>{p.name}</b>
                  <span className="down">{fmtPct(p.pct)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <div className="empty">待今日开盘（开盘后自动显示昨日每只涨停股的今日表现）</div>}
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>隔夜外围 · 方向映射 <span className="page-tag">5 秒实时</span></h3>
        <div className="us-grid">
          {global.map((g) => <GlobalCard key={g.key} g={g} />)}
          {global.length === 0 && <div className="empty">加载中…</div>}
        </div>
        <div className="hint">A50 期货是最直接的 A 股开盘先行指标</div>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>美股明星股 · 隔夜方向 → A股概念映射 <span className="page-tag">5 秒实时</span></h3>
        <div className="us-grid">
          {us.map((s) => <UsCard key={s.key} s={s} />)}
          {us.length === 0 && <div className="empty">加载中…</div>}
        </div>
        <div className="hint">隔夜大涨方向 = 今日 A 股对应概念的抢筹预期，到竞价雷达里验证</div>
      </div>

      <div className="row2">
        <div className="panel">
          <h3>舆论热度 · 快讯题材词频（最近 60 条）</h3>
          <table className="tbl compact">
            <tbody>
              {(sent?.themes || []).slice(0, 8).map((t) => (
                <tr key={t.name}>
                  <td className="name" style={{ width: 90 }}>{t.name}</td>
                  <td style={{ width: 60 }} className={t.count >= 3 ? 'up bold' : ''}>{t.count} 条</td>
                  <td className="muted reasons-cell">{(t.examples || []).join('；')}</td>
                </tr>
              ))}
              {(!sent || !sent.themes?.length) && <tr><td className="empty" colSpan={3}>暂无热点命中</td></tr>}
            </tbody>
          </table>
          <div className="hint">词频高 = 舆论在炒的方向；配合题材热度（涨停家数）交叉验证——光有新闻没资金的不碰</div>
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
