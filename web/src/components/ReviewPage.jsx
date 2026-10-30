// 收盘复盘 + 明日应对策略 + 交易计划（关注股竞价应对表）
import { useEffect, useState } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtAmount } from '../lib/format.js';
import { api, CLOUD } from '../lib/api.js';
import { useFlash } from '../lib/useFlash.js';


const LEVEL_META = {
  hot: { label: '重仓出击', cls: 'lab-hot', border: 'var(--up)' },
  warm: { label: '轻仓试错', cls: 'lab-warm', border: 'var(--warn)' },
  cool: { label: '只看低吸', cls: 'lab-cool', border: '#58a6ff' },
  freeze: { label: '空仓观望', cls: 'lab-freeze', border: 'var(--down)' },
};

// 明日应对方案：环境定性 → 方向 → 标的 → 失败预案 → 风控红线
function TomorrowPlan({ plan, onOpenStock }) {
  if (!plan?.verdict) return null;
  const v = plan.verdict;
  const meta = LEVEL_META[v.level] || LEVEL_META.cool;
  const d = plan.directions || {};
  const targets = plan.targets || [];
  const contingency = plan.contingency || [];
  const risk = plan.risk || [];

  return (
    <div className="panel tp-panel" style={{ borderColor: meta.border }}>
      <h3>明日应对方案（综合 情绪周期 + 龙头分层 + 题材生命周期 + 炸板归因）</h3>

      {/* 一、环境定性 */}
      <div className="tp-verdict">
        <span className={`v label ${meta.cls}`} style={{ fontSize: 22 }}>{v.action}</span>
        <ul className="tp-reasons">
          {(v.reasons || []).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>

      <div className="row2">
        {/* 二、方向 */}
        <div>
          <div className="k" style={{ fontSize: 12, marginBottom: 6 }}>方向</div>
          {(d.go || []).length > 0 && (
            <div className="tp-dir">
              <em className="lb lb-green">做多</em>
              {(d.go || []).map((g) => (
                <span className="tp-dir-item" key={g.direction} title={(g.reasons || []).join(' · ')}>
                  {g.direction}<b>{g.score}</b>
                </span>
              ))}
            </div>
          )}
          {(d.avoid || []).length > 0 && (
            <div className="tp-dir">
              <em className="lb lb-high">回避</em>
              {(d.avoid || []).map((a) => (
                <span className="tp-dir-item tp-avoid" key={a.industry} title={a.why}>{a.industry}</span>
              ))}
            </div>
          )}
          {(d.watch || []).length > 0 && (
            <div className="tp-dir">
              <em className="lb">观察</em>
              {(d.watch || []).map((w) => (
                <span className="tp-dir-item tp-watch" key={w.direction}>{w.direction}<b>{w.score}</b></span>
              ))}
            </div>
          )}
          {(!d.go || !d.go.length) && (!d.avoid || !d.avoid.length) && <div className="hint">方向信号不足，以观察为主</div>}
        </div>

        {/* 五、风控红线 */}
        <div>
          <div className="k" style={{ fontSize: 12, marginBottom: 6 }}>风控红线</div>
          <ul className="tp-risk">
            {risk.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      </div>

      {/* 三、标的 */}
      {targets.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="k" style={{ fontSize: 12, marginBottom: 6 }}>
            标的（来自龙头分层 · 按角色与质量分排序）
            <span className="muted" style={{ fontWeight: 'normal', marginLeft: 6 }}>点击看详情</span>
          </div>
          <table className="tbl compact">
            <thead><tr><th>角色</th><th>名称</th><th>板数</th><th>质量分</th><th>封流比</th><th>次日预期</th><th>理由</th></tr></thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.code}>
                  <td><span className={`lb ${t.role.includes('卡位') ? 'lb-high' : ''}`}>{t.role}</span></td>
                  <td className="name"><span className="name-link" onClick={() => onOpenStock(t.code, t.name)}>{t.name}<small>{t.code}</small></span></td>
                  <td className="bold">{t.lianban}板</td>
                  <td className={t.quality != null ? (t.quality >= 75 ? 'up bold' : t.quality >= 60 ? 'warn' : 'muted') : 'muted'}>{t.quality != null ? t.quality : '-'}</td>
                  <td className="muted">{t.sealRatio != null ? `${t.sealRatio}%` : '-'}</td>
                  <td className="reasons-cell">{t.nextDay ? t.nextDay.text : '低位首板套利，看竞价承接'}</td>
                  <td className="muted reasons-cell">{t.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 四、失败预案 */}
      {contingency.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="k" style={{ fontSize: 12, marginBottom: 6 }}>
            失败预案（做错了怎么办 · 盘前想好，盘中不慌）
          </div>
          <table className="tbl compact">
            <thead><tr><th>触发条件</th><th>动作</th><th>说明</th></tr></thead>
            <tbody>
              {contingency.map((c, i) => (
                <tr key={i}>
                  <td className="name tp-trigger">{c.trigger}</td>
                  <td><span className="lb lb-warn">{c.action}</span></td>
                  <td className="muted reasons-cell">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// 题材生命周期阶段 → 徽章配色（复用 .lb / .lb-high 系，保持全站一致）
const PHASE_LB = {
  高潮: 'lb-high',   // 红（最热）
  分歧: 'lb-warn',   // 橙
  发酵: 'lb-green',  // 绿（健康）
  启动: '',          // 默认
  退潮: 'lb-cool',   // 蓝（冷）
};

function PlanCard({ plan, onOpenStock }) {
  return (
    <div className="panel plan-card">
      <div className="plan-head">
        <span className="name-link" onClick={() => onOpenStock(plan.code, plan.name)}>
          <b>{plan.name}</b><small>{plan.code}</small>
          {plan.from && <span className="lb lb-high">{plan.from}</span>}
        </span>
        <span className="lb lb-high">{plan.role}</span>
        <span className="plan-mode">{plan.mode}</span>
        {plan.lianban ? <span className="lb">昨日{plan.lianban}板</span> : null}
        {plan.isTheme && <span className="lb">主线·{plan.industry}</span>}
      </div>
      <div className="plan-meta">
        <span>现价 {fmtPrice(plan.price)}({fmtPct(plan.pct)})</span>
        {plan.ma5 && <span>MA5 {plan.ma5}</span>}
        {plan.ma10 && <span>MA10 {plan.ma10}</span>}
        {plan.vol5 != null && <span>5日均量 {(plan.vol5 / 100).toFixed(0)}手</span>}
        <span className="pos-tag">仓位 {plan.position}</span>
      </div>
      <div className="plan-note">{plan.modeNote}</div>
      <table className="tbl compact">
        <thead><tr><th style={{ maxWidth: 210 }}>竞价情景</th><th>操作</th></tr></thead>
        <tbody>
          {plan.scenarios.map((s, i) => (
            <tr key={i}>
              <td className="plan-cond">{s.cond}</td>
              <td className="plan-action">{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="plan-ckpt">
        <div className="k">盘中检查点</div>
        {plan.checkpoints.map((c) => (
          <div className="ckpt-row" key={c[0]}><b>{c[0]}</b><span>{c[1]}</span></div>
        ))}
        <div className="ckpt-row stop"><b>止损</b><span>{plan.stop}</span></div>
        <div className="ckpt-row"><b>目标</b><span>{plan.target}</span></div>
      </div>
    </div>
  );
}

export default function ReviewPage({ tick, watch, onOpenStock }) {
  const [review, setReview] = useState(null);
  const [plans, setPlans] = useState([]);
  const [dates, setDates] = useState([]);
  const [viewDate, setViewDate] = useState('');
  const [planMode, setPlanMode] = useState('auto'); // auto=系统推荐 manual=自选票 // 空 = 实时
  const [picked, setPicked] = useState([]);
  const [manual, setManual] = useState('');
  const flash = useFlash(review?.generatedAt, 60000);

  useEffect(() => {
    api('reviewDates').then((d) => Array.isArray(d) && setDates(d)).catch(() => {});
    fetch('/api/user').then((r) => r.json()).then((u) => Array.isArray(u.picks) && u.picks.length && setPicked(u.picks)).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const url = viewDate ? 'review/bydate?date=' + viewDate : 'review';
        const d = await api(url);
        if (d && d.emotion) setReview(d);
      } catch { /* 保留旧 */ }
    };
    load();
    if (viewDate) return; // 历史存档不轮询
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [viewDate]);

  const codes = picked.join(',');
  useEffect(() => {
    if (picked.length) fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks: picked }) }).catch(() => {});
  }, [codes]);
  useEffect(() => {
    const load = () => {
      if (planMode === 'manual' && !codes) { setPlans([]); return; }
      const url = planMode === 'manual' ? 'plan?codes=' + codes : 'plan';
      api(url).then((d) => d && Array.isArray(d.plans) && setPlans(d.plans)).catch(() => {});
    };
    load();
    if (CLOUD) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [planMode, codes]);

  const addPick = (code) => {
    if (!/^\d{6}$/.test(code) || picked.includes(code) || picked.length >= 3) return;
    setPicked([...picked, code]);
  };
  const removePick = (code) => setPicked(picked.filter((c) => c !== code));

  const em = review?.emotion;
  const mk = review?.market;

  return (
    <div className="page">
      <h2 className="page-title">
        收盘复盘 · 明日应对
        <span className={`page-tag ${flash}`}>{review ? `交易日 ${review.date}` : '生成中…'}</span>
        <span className="page-tag">每交易日 15:05 自动落盘</span>
        {dates.length > 0 && (
          <select className="date-select" value={viewDate} onChange={(e) => setViewDate(e.target.value)}>
            <option value="">最新（实时生成）</option>
            {dates.map((d) => <option key={d} value={d}>存档 {d.slice(4, 6)}/{d.slice(6, 8)}</option>)}
          </select>
        )}
      </h2>

      {review && (
        <>
          <div className="cards">
            <div className="card">
              <div className="k">情绪周期定位</div>
              <div className="v label lab-warm">{em?.cycleStage || '-'}</div>
              <div className="note">{em?.cycleDesc}</div>
            </div>
            <div className="card">
              <div className="k">开仓评分</div>
              <div className="v">{em?.env?.total ?? '-'}</div>
              <div className="note">{em?.env?.label} · {em?.env?.advice?.slice(0, 22) || ''}</div>
            </div>
            <div className="card"><div className="k">涨停 / 跌停</div><div className="v"><span className="up">{em?.ztCount}</span> / <span className="down">{em?.dtCount}</span></div><div className="note">炸板 {em?.zbCount} · 炸板率 {em?.zhaRate != null ? (em.zhaRate * 100).toFixed(0) + '%' : '-'}</div></div>
            <div className="card"><div className="k">最高连板</div><div className="v">{em?.maxLianban}<small>板</small></div><div className="note">昨日溢价 {em?.premium ? (em.premium.avg > 0 ? '+' : '') + em.premium.avg + '%' : '-'}</div></div>
            <div className="card"><div className="k">两市成交额</div><div className="v">{fmtAmount(mk?.amount2m)}</div><div className="note">{mk?.amountDeltaPct != null ? `环比 ${mk.amountDeltaPct > 0 ? '+' : ''}${mk.amountDeltaPct.toFixed(1)}%` : ''}</div></div>
          </div>

          <div className="panel">
            <h3>明日应对策略（自动生成）</h3>
          <TomorrowPlan plan={review.tomorrowPlan} onOpenStock={onOpenStock} />

            <ol className="strategy-list">
              {(review.strategy || []).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>

          {/* E1 深度复盘：题材生命周期 */}
          <div className="panel">
            <h3>题材生命周期（逐题材判定 · 不是全市场一个阶段）</h3>
            <table className="tbl compact">
              <thead><tr><th>题材</th><th>阶段</th><th>涨停</th><th>炸板</th><th>最高板</th><th>均板</th><th>封单(亿)</th><th>龙头</th><th>判定依据</th></tr></thead>
              <tbody>
                {(review.deep?.lifecycle || []).slice(0, 20).map((lc) => (
                  <tr key={lc.industry}>
                    <td className="name">{lc.industry}</td>
                    <td><span className={`lb ${PHASE_LB[lc.phase] || ''}`}>{lc.phase}</span></td>
                    <td className="up bold">{lc.ztCount}</td>
                    <td className={lc.zhaCount > 0 ? 'warn' : 'muted'}>{lc.zhaCount}</td>
                    <td className="bold">{lc.maxLianban || '-'}</td>
                    <td className="muted">{lc.avgLianban || '-'}</td>
                    <td className="muted">{lc.sealFund || '-'}</td>
                    <td>{lc.top || '-'}</td>
                    <td className="muted reasons-cell">{lc.note}</td>
                  </tr>
                ))}
                {(review.deep?.lifecycle || []).length === 0 && <tr><td colSpan={9} className="empty">暂无涨停数据</td></tr>}
              </tbody>
            </table>
            {(review.deep?.lifecycle || []).length > 20 && (
              <div className="hint" style={{ marginTop: 6 }}>仅显示前 20 个题材（共 {review.deep.lifecycle.length} 个，已按阶段与涨停家数排序）</div>
            )}
            <div className="hint" style={{ marginTop: 8 }}>同一交易日不同题材处在不同阶段：只做"发酵/高潮"方向的龙头，"退潮/分歧"方向回避。断板题材标"退潮"，是回避而不是抄底。</div>
          </div>

          {/* E1 深度复盘：炸板归因 */}
          <div className="panel">
            <h3>炸板归因（{review.emotion?.zbCount ?? 0} 只炸板 · 分清龙头分歧还是方向退潮）</h3>
            <table className="tbl compact">
              <thead><tr><th>归因</th><th>只数</th><th>说明</th><th>个股</th></tr></thead>
              <tbody>
                {Object.entries(review.deep?.zhaAttr || {}).map(([k, b]) => (
                  <tr key={k} className={b.count === 0 ? 'zero-row' : ''}>
                    <td className="name">{b.label}</td>
                    <td className={b.count > 0 ? 'warn bold' : 'muted'}>{b.count}</td>
                    <td className="muted reasons-cell">{b.desc}</td>
                    <td className="reasons-cell">
                      {b.stocks.length === 0 ? <span className="muted">-</span> : b.stocks.slice(0, 6).map((s, i) => (
                        <span key={s.code}>
                          {i > 0 && <span className="muted"> · </span>}
                          <span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}</span>
                          <span className="muted">{s.lianban ? `${s.lianban}板` : '首板'}/开{s.zhaCount}次</span>
                        </span>
                      ))}
                      {b.count > 6 && <span className="muted"> …另 {b.count - 6} 只</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* E1 深度复盘：明日主线推演 */}
          <div className="panel">
            <h3>明日主线推演（连板梯队 × 舆论词频 × 板块涨幅 交叉验证）</h3>
            {(review.deep?.forecast?.mainlines || []).length > 0 ? (
              <table className="tbl compact">
                <thead><tr><th>方向</th><th>评分</th><th>支撑理由</th></tr></thead>
                <tbody>
                  {review.deep.forecast.mainlines.map((m, i) => (
                    <tr key={m.direction}>
                      <td className="name">{i === 0 ? '🥇 ' : ''}{m.direction}</td>
                      <td className={`bold ${m.score > 0 ? 'up' : 'down'}`}>{m.score}</td>
                      <td className="muted reasons-cell">{m.reasons.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">今日无 2 板以上梯队，明日以观察为主</div>}
            {(review.deep?.forecast?.watchOnly || []).length > 0 && (
              <>
                <h3 style={{ marginTop: 10 }}>仅观察（有舆论/涨幅但无涨停接力，不动手）</h3>
                <div className="fc-watch">
                  {review.deep.forecast.watchOnly.map((m) => (
                    <span className="dir-tag" key={m.direction} title={m.reasons.join(' · ')}>
                      {m.direction} <b>{m.score}</b>
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="hint" style={{ marginTop: 8 }}>{review.deep?.forecast?.note}</div>
          </div>

          <div className="row2">
            <div className="panel">
              <h3>今日题材热度（涨停家数排序）</h3>
              <table className="tbl compact">
                <thead><tr><th>题材</th><th>涨停</th><th>龙头</th><th>梯队</th></tr></thead>
                <tbody>
                  {(review.themes || []).slice(0, 10).map((th) => (
                    <tr key={th.industry}>
                      <td className="name">{th.industry}</td>
                      <td className="up bold">{th.count}</td>
                      <td>{th.top}</td>
                      <td className="muted">
                        {th.stocks.filter((s) => s.lianban > 1).length
                          ? th.stocks.filter((s) => s.lianban > 1).map((s, i) => (
                            <span key={s.code}>
                              {i > 0 ? ' · ' : ''}
                              <span className="name-link" onClick={() => onOpenStock?.(s.code, s.name)}>{s.name}{s.lianban}板</span>
                            </span>
                          ))
                          : '全首板'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <h3>明日关注（扫描器 Top6 × 3 策略）</h3>
              <table className="tbl compact">
                <thead><tr><th>来源</th><th>名称</th><th>涨幅</th><th>评分</th><th>命中点</th></tr></thead>
                <tbody>
                  {[
                    ...(review.watchTomorrow?.fangliang || []).map((s) => ({ ...s, src: '放量' })),
                    ...(review.watchTomorrow?.huita || []).map((s) => ({ ...s, src: '回踩' })),
                    ...(review.watchTomorrow?.reflow || []).map((s) => ({ ...s, src: '回流' })),
                  ].map((s) => (
                    <tr key={s.src + s.code}>
                      <td><span className="lb">{s.src}</span></td>
                      <td className="name"><span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}<small>{s.code}</small></span></td>
                      <td className={pctCls(s.pct)}>{fmtPct(s.pct)}</td>
                      <td>{s.score}</td>
                      <td className="muted reasons-cell">{(s.reasons || []).slice(0, 2).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="panel">
        <h3>
          交易计划 · 关注股作战卡（系统推荐 6 只 · 9:15 竞价后照表执行）
          <button className={`mini ${planMode === 'auto' ? 'active-mini' : ''}`} onClick={() => { setPlanMode('auto'); setPicked([]); }}>🎯 系统推荐</button>
          <button className={`mini ${planMode === 'manual' ? 'active-mini' : ''}`} onClick={() => setPlanMode('manual')}>从自选挑</button>
        </h3>
        <div className="plan-picker">
          {(watch || []).map((w) => (
            <button key={w.code} className={`mini ${picked.includes(w.code) ? 'active-mini' : ''}`} onClick={() => picked.includes(w.code) ? removePick(w.code) : addPick(w.code)}>
              {w.name}
            </button>
          ))}
          <input placeholder="或输代码加入" value={manual} onChange={(e) => setManual(e.target.value)} style={{ width: 130 }} />
          <button className="mini" onClick={() => { addPick(manual.trim()); setManual(''); }}>加入</button>
          <span className="muted" style={{ fontSize: 12 }}>
            已选 {picked.length}/3：{picked.length ? picked.join(', ') : '无'}
            {picked.length >= 3 ? ' · 已满，专注才有纪律' : ''}
          </span>
        </div>
        <div className="hint" style={{ margin: '6px 0 10px' }}>
          选票思路不必选最强的：情绪【{review?.emotion?.cycleStage || '…'}】阶段，主线题材的低位首板是确定性较高的<span className="up">套利板</span>；
          龙头适合低吸/锁仓，跟风只做弱转强。每张卡按"竞价情景 → 检查点 → 止损止盈"执行。
          {planMode === 'auto' ? ' 系统推荐优先级：空间板龙头 → 回流预期 → 底部放量 → 缩量回踩。' : ''}
        </div>
        <div className="row2" style={{ marginTop: 10 }}>
          {plans.map((p) => <PlanCard key={p.code} plan={p} onOpenStock={onOpenStock} />)}
          {plans.length === 0 && (
            <div className="empty">
              {planMode === 'auto'
                ? '系统推荐生成中…（来源：空间板龙头 / 回流预期 / 底部放量 / 缩量回踩，自动去重取 3 只）'
                : '从自选股点选或输入代码（≤3 只），生成"竞价情景 + 检查点 + 止损止盈"作战卡'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
