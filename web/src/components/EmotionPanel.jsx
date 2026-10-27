import { fmtAmount, fmtPct, pctCls, fmtInt } from '../lib/format.js';

const LABEL_STYLE = {
  亢奋: 'lab-hot',
  活跃: 'lab-warm',
  一般: 'lab-neutral',
  偏冷: 'lab-cool',
  冰点: 'lab-freeze',
};

function comment(t) {
  if (!t) return '';
  const parts = [];
  parts.push(`涨停 ${t.ztCount} 家`);
  if (t.zhaRate != null) parts.push(`炸板率 ${(t.zhaRate * 100).toFixed(0)}%`);
  if (t.maxLianban) parts.push(`最高 ${t.maxLianban} 板`);
  if (t.ztCount + t.zbCount === 0) return '暂无涨停数据（可能未开盘或非交易日）';
  let advice = '中性看待';
  if (t.emotionLabel === '亢奋' || t.emotionLabel === '活跃') advice = '情绪在线，可积极参与主线题材';
  else if (t.emotionLabel === '偏冷') advice = '控制仓位，只做确定性机会';
  else if (t.emotionLabel === '冰点') advice = '空仓观望为主，等冰点后的修复';
  return parts.join(' · ') + ` → ${advice}`;
}

export default function EmotionPanel({ tick, pools }) {
  if (!tick) return <div className="empty">连接行情服务中…</div>;
  const t = tick;
  const zt = [...(pools?.zt || [])].sort((a, b) => (b.lianban || 1) - (a.lianban || 1));
  const ladder = zt.slice(0, 8);

  const dist = t.lianbanDist || {};
  const keys = Object.keys(dist).map(Number).sort((a, b) => a - b);
  const maxV = Math.max(1, ...keys.map((k) => dist[k]));

  return (
    <div className="emotion">
      <div className="cards">
        <div className="card">
          <div className="k">开仓环境</div>
          <div className="v">{tick.env ? tick.env.total : '-'}</div>
          <div className="note">{tick.env ? tick.env.label + ' · ' + tick.env.advice : ''}</div>
        </div>
        <div className="card">
          <div className="k">市场情绪</div>
          <div className={`v label ${LABEL_STYLE[t.emotionLabel] || 'lab-neutral'}`}>{t.emotionLabel}</div>
          <div className="note">{comment(t)}</div>
        </div>
        <div className="card"><div className="k">涨停</div><div className="v up">{t.ztCount}</div><div className="note">炸板 {t.zbCount} 家</div></div>
        <div className="card"><div className="k">炸板率</div><div className="v">{t.zhaRate != null ? (t.zhaRate * 100).toFixed(0) + '%' : '-'}</div><div className="note">{t.zhaRate != null && t.zhaRate > 0.3 ? '封板质量差' : '封板质量正常'}</div></div>
        <div className="card"><div className="k">最高连板</div><div className="v">{t.maxLianban || 0}<small>板</small></div><div className="note">空间高度</div></div>
        <div className="card">
          <div className="k">昨日涨停溢价</div>
          <div className={`v ${t.premium ? (t.premium.avg > 0 ? 'up' : 'down') : ''}`}>{t.premium ? (t.premium.avg > 0 ? '+' : '') + t.premium.avg + '%' : '-'}</div>
          <div className="note">{t.premium ? `中位 ${t.premium.median}% · 翻红 ${t.premium.redRate}%` : '待今日开盘'}</div>
        </div>
        <div className="card">
          <div className="k">上涨 / 下跌</div>
          <div className="v"><span className="up">{fmtInt(t.advancers)}</span> / <span className="down">{fmtInt(t.decliners)}</span></div>
          <div className="note">平 {fmtInt(t.flat)}</div>
        </div>
        <div className="card">
          <div className="k">两市成交额</div>
          <div className="v">{fmtAmount(t.amount2m)}</div>
          <div className="note">
            {t.amountDeltaPct != null ? (
              <>较昨收同时段 <span className={pctCls(t.amountDeltaPct)}>{fmtPct(t.amountDeltaPct)}</span></>
            ) : '昨日基准待收盘生成'}
          </div>
        </div>
      </div>

      {t.jinji && t.jinji.length > 0 && (
        <div className="panel jinji-panel">
          <h3>连板晋级率</h3>
          <div className="jinji-line">
            {t.jinji.map((j) => (
              <span key={j.from} className="jinji-item">{j.from}进{j.to} <b className={j.rate >= 40 ? 'up' : j.rate >= 20 ? '' : 'down'}>{j.rate}%</b><small>({j.num}/{j.den})</small></span>
            ))}
          </div>
        </div>
      )}

      {t.dist13 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <h3>涨跌分布（全市场 13 档 · 每 5 分钟全量扫描）</h3>
          <div className="bars">
            {t.dist13.map((b) => {
              const max = Math.max(1, ...t.dist13.map((x) => x.count));
              const w = Math.max((b.count / max) * 100, b.count > 0 ? 2 : 0);
              const down = b.label.startsWith('跌');
              return (
                <div className="bar-row" key={b.label}>
                  <span className="bar-label">{b.label}</span>
                  <div className="bar-track">
                    <div className={`bar-fill ${down ? 'fill-down' : ''}`} style={{ width: `${w}%` }}>
                      {b.count > 0 && <em>{b.count}</em>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hint">红色档多=普涨赚钱效应；深跌档多=防守等待。涨停附近含 20cm 未板的高涨幅票</div>
        </div>
      )}

      <div className="row2">
        <div className="panel">
          <h3>连板分布</h3>
          <div className="bars">
            {keys.length === 0 && <div className="empty">暂无数据</div>}
            {keys.map((k) => (
              <div className="bar-row" key={k}>
                <span className="bar-label">{k >= 10 ? '10板+' : k === 1 ? '首板' : `${k}板`}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(dist[k] / maxV) * 100}%` }}>
                    <em>{dist[k]}</em>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>连板梯队（高度前8）</h3>
          <div className="ladder">
            {ladder.length === 0 && <div className="empty">暂无数据</div>}
            {ladder.map((s) => (
              <div className="ladder-row" key={s.code}>
                <span className={`lb ${s.lianban >= 3 ? 'lb-high' : ''}`}>{s.lianban}板</span>
                <span className="lname">{s.name}</span>
                <span className="lcode">{s.code}</span>
                <span className="lind">{s.industry}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
