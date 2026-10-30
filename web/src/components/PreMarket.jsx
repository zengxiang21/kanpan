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

// 可点击看K线的品种：期货用 hf_ 前缀（App.jsx 据此分流到 FutureDetail），
// 美股三指数现货用腾讯的 us 代码；其余（恒指/日经/A50无K线源的）不传 code 就不可点
const KLINE_CODE = {
  nq: 'hf_NQ', es: 'hf_ES', ym: 'hf_YM',
  ixic: 'usIXIC', dji: 'usDJI', inx: 'usINX',
};

function GlobalCard({ g, onOpenStock }) {
  const flash = useFlash(g.price);
  const kcode = KLINE_CODE[g.key];
  const clickable = !!kcode;
  return (
    <div
      className={`us-card ${flash} ${clickable ? 'dir-btn' : ''}`}
      onClick={clickable ? () => onOpenStock?.(kcode, g.name) : undefined}
      title={clickable ? `${g.name} · 点击看K线` : g.name}
    >
      <div className="us-head"><b>{g.name}</b><span className={g.pct > 0 ? 'up' : g.pct < 0 ? 'down' : 'muted'}>{g.pct > 0 ? '+' : ''}{g.pct}%</span></div>
      <div className="muted" style={{ fontSize: 11 }}>{GLOBAL_MAP[g.name] || ''} · {g.price}{clickable ? ' · 看K线' : ''}</div>
    </div>
  );
}

// 美股/外围方向 → A股概念 映射（人工维护，JSON 化后续做设置页）
const GLOBAL_MAP = {
  纳斯达克期货: '科技股开盘风向标 · 23.5小时连续',
  标普500期货: '全球风险偏好先行',
  道琼斯期货: '权重/价值风格先行',
  纳斯达克: '科技/成长风格风向标',
  道琼斯: '权重/价值风格',
  标普指数: '全球风险偏好',
  恒生指数: '港股联动 · 中概情绪',
  日经指数: '亚太风险偏好',
  富时A50期货: 'A股开盘前最重要先行指标',
};

export default function PreMarket({ tick, onOpenStock }) {
  const [global, setGlobal] = useState([]);
  const [us, setUs] = useState([]);
  const [news, setNews] = useState([]);
  const [sent, setSent] = useState(null);
  const [macro, setMacro] = useState(null);
  const [earnings, setEarnings] = useState(null);

  useEffect(() => {
    // 美股/全球指数 5 秒快刷（美股盘中是实时盘）；快讯/词频 60 秒
    const fast = () => {
      api('us').then((d) => Array.isArray(d) && setUs(d)).catch(() => {});
      api('global').then((d) => Array.isArray(d) && setGlobal(d)).catch(() => {});
    };
    const slow = () => {
      api('news').then((d) => Array.isArray(d) && setNews(d)).catch(() => {});
      api('sentiment').then((d) => d && d.themes && setSent(d)).catch(() => {});
      api('macro?days=30').then((d) => d && setMacro(d)).catch(() => {});
      // 财报日期来自 SEC EDGAR 推算，不需要快刷
      api('earnings/us?days=60').then((d) => d && setEarnings(d)).catch(() => {});
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
  const cycleStage = tick?.cycleStage || null;
  const cycleDesc = tick?.cycleDesc || '';
  const cyclePlaybook = tick?.cyclePlaybook || '';

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

      {cycleStage && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <h3>情绪周期定位与今日打法（超短知识库 · 情绪周期六阶段）</h3>
          <div className="plan-head">
            <span className="v label lab-warm" style={{ fontSize: 20 }}>{cycleStage}</span>
            <span style={{ fontSize: 13, lineHeight: 1.8 }}>
              {cyclePlaybook || cycleDesc}
            </span>
          </div>
          <div className="hint">
            判定依据：{cycleDesc || '涨停数/炸板率/最高板/昨日溢价'}
            （涨停 {tick?.ztCount ?? '-'} · 炸板率 {tick?.zhaRate != null ? (tick.zhaRate * 100).toFixed(0) + '%' : '-'} · 最高 {tick?.maxLianban ?? '-'} 板）
            —— 与收盘复盘页同口径；配合竞价雷达验证方向强度
          </div>
        </div>
      )}

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
                  <span className="name-link" onClick={() => onOpenStock?.(p.code, p.name)}>{p.name}</span>
                  <span className="up">{fmtPct(p.pct)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="k" style={{ color: 'var(--down)', marginBottom: 4 }}>最弱 Top8（亏钱效应来源）</div>
              {tick.premiumDetail.slice(-8).reverse().map((p) => (
                <div className="prem-row" key={p.code}>
                  <span className="lb">{p.lianban}板</span>
                  <span className="name-link" onClick={() => onOpenStock?.(p.code, p.name)}>{p.name}</span>
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
          {global.map((g) => <GlobalCard key={g.key} g={g} onOpenStock={onOpenStock} />)}
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

      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>
          美国宏观数据日历（未来 30 天）
          <span className="page-tag">盘前规避用</span>
        </h3>
        {(macro?.events || []).length === 0 ? (
          <div className="empty">未来 30 天无已知宏观数据发布</div>
        ) : (
          <table className="tbl compact">
            <thead><tr><th>日期</th><th>时间(北京)</th><th>事件</th><th>重要性</th><th>影响</th></tr></thead>
            <tbody>
              {(macro?.events || []).slice(0, 12).map((e) => (
                <tr key={e.date + e.title} className={e.daysAhead === 0 ? 'row-today' : ''}>
                  <td className="name" style={{ maxWidth: 92 }}>
                    {e.date}
                    {e.daysAhead === 0 && <em className="label lab-hot" style={{ marginLeft: 4 }}>今日</em>}
                    {e.daysAhead > 0 && e.daysAhead <= 2 && <em className="label lab-warm" style={{ marginLeft: 4 }}>{e.daysAway || e.daysAhead}天后</em>}
                  </td>
                  <td className="muted" style={{ maxWidth: 70 }}>{e.time}</td>
                  <td style={{ maxWidth: 150 }}>{e.title}</td>
                  <td style={{ maxWidth: 60 }}>{'★'.repeat(e.importance)}</td>
                  <td className="muted reasons-cell">{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="hint" style={{ marginTop: 8 }}>
          {macro?.note}
          <br />
          <span className="muted">数据来源：{macro?.source}。无前值/预期值/实际值（免费结构化源 14 个全部不可用，见 ROADMAP C4）。</span>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>
          美股大公司财报日历（未来 60 天）
          <span className="page-tag">映射 A 股板块</span>
        </h3>
        {(earnings?.events || []).length === 0 ? (
          <div className="empty">暂无财报日历数据</div>
        ) : (
          <table className="tbl compact">
            <thead><tr><th>推算窗口</th><th>公司</th><th>产业链</th><th>A 股映射方向</th><th>上次实发</th></tr></thead>
            <tbody>
              {(earnings?.events || []).map((e) => (
                <tr key={e.ticker} className={e.status === 'today' ? 'row-today' : ''}>
                  <td className="name" style={{ maxWidth: 128 }}>
                    {e.date}
                    {e.windowEnd && e.windowEnd !== e.date && <span className="muted"> ~ {e.windowEnd}</span>}
                    {e.status === 'today' && <em className="label lab-hot" style={{ marginLeft: 4 }}>今晚</em>}
                    {e.status === 'upcoming' && e.daysAhead <= 3 && <em className="label lab-warm" style={{ marginLeft: 4 }}>{e.daysAhead}天后</em>}
                    {e.status === 'justPassed' && <small className="muted" style={{ marginLeft: 4 }}>刚过{-e.daysAhead}天</small>}
                  </td>
                  <td style={{ maxWidth: 110 }}>
                    {e.company}
                    <small className="muted"> {e.ticker}</small>
                    <small className="muted">{'★'.repeat(e.importance)}</small>
                  </td>
                  <td className="muted" style={{ maxWidth: 120 }}>{e.chain}</td>
                  <td className="reasons-cell" style={{ color: 'var(--accent)' }}>{e.aShare}</td>
                  <td className="muted" style={{ maxWidth: 96 }}>
                    {e.lastReport || '-'}
                    {e.lastDaysAgo != null && <small>（{e.lastDaysAgo}天前）</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="hint" style={{ marginTop: 8 }}>
          {earnings?.note}
          <br />
          <span className="muted">
            数据来源：{earnings?.source}。窗口上限取自该公司同财季历史最晚发财报日，
            故区间偏宽但不会漏；「刚过」= 推算日已过几天，可能昨晚已发布，请看隔夜美股表现。
          </span>
          {earnings?.unavailable?.length > 0 && (
            <>
              <br />
              <span className="muted">
                暂不能自动获取：{earnings.unavailable.join('；')}。要覆盖需人工维护静态表。
              </span>
            </>
          )}
        </div>
      </div>

      <div className="row2">
        <div className="panel">
          <h3>舆论热度 · 快讯题材词频（最近 60 条）</h3>
          <table className="tbl compact">
            <tbody>
              {(sent?.themes || []).slice(0, 8).map((t) => (
                <tr key={t.name}>
                  <td className="name" style={{ maxWidth: 90 }}>{t.name}</td>
                  <td style={{ maxWidth: 60 }} className={t.count >= 3 ? 'up bold' : ''}>{t.count} 条</td>
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
