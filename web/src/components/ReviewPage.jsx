// 收盘复盘 + 明日应对策略 + 交易计划（关注股竞价应对表）
import { useEffect, useState } from 'react';
import { fmtPrice, fmtPct, pctCls, fmtAmount } from '../lib/format.js';
import { api, CLOUD } from '../lib/api.js';
import { useFlash } from '../lib/useFlash.js';

function PlanCard({ plan, onOpenStock }) {
  return (
    <div className="panel plan-card">
      <div className="plan-head">
        <span className="name-link" onClick={() => onOpenStock(plan.code, plan.name)}>
          <b>{plan.name}</b><small>{plan.code}</small>
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
        <thead><tr><th style={{ width: 210 }}>竞价情景</th><th>操作</th></tr></thead>
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
  const [viewDate, setViewDate] = useState(''); // 空 = 实时
  const [picked, setPicked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('plan-picks') || '[]');
    } catch {
      return [];
    }
  });
  const [manual, setManual] = useState('');
  const flash = useFlash(review?.generatedAt, 60000);

  useEffect(() => {
    api('reviewDates').then((d) => Array.isArray(d) && setDates(d)).catch(() => {});
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
    localStorage.setItem('plan-picks', JSON.stringify(picked));
    if (!codes) { setPlans([]); return; }
    api('plan?codes=' + codes).then((d) => Array.isArray(d) && setPlans(d)).catch(() => {});
  }, [codes]);

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
            <ol className="strategy-list">
              {(review.strategy || []).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
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
                      <td className="muted">{th.stocks.filter((s) => s.lianban > 1).map((s) => `${s.name}${s.lianban}板`).join(' · ') || '全首板'}</td>
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
        <h3>交易计划 · 关注股作战卡（最多 3 只 · 9:15 竞价后照表执行）</h3>
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
        </div>
        <div className="row2" style={{ marginTop: 10 }}>
          {plans.map((p) => <PlanCard key={p.code} plan={p} onOpenStock={onOpenStock} />)}
          {picked.length === 0 && <div className="empty">从自选股点选或输入代码（≤3 只），生成"竞价情景 + 检查点 + 止损止盈"作战卡</div>}
        </div>
      </div>
    </div>
  );
}
