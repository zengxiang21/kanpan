// 龙头分层动态池（E4）：总龙头 / 龙二 / 分支龙头 + 动态进出状态
import { useEffect, useState } from 'react';
import { api, CLOUD } from '../lib/api.js';

const STATUS = {
  new: { label: '新进', cls: 'lab-hot' },
  up: { label: '升级', cls: 'lab-warm' },
  hold: { label: '保持', cls: 'lab-cool' },
  down: { label: '降位', cls: 'lab-freeze' },
  drop: { label: '断板', cls: 'lab-freeze' },
};

function Tier({ title, hint, list, onOpenStock, tone }) {
  return (
    <div className="panel">
      <h3>{title}<span className="muted" style={{ fontSize: 11, fontWeight: 'normal', marginLeft: 8 }}>{hint}</span></h3>
      {list.length === 0 && <div className="empty">暂无</div>}
      <div className="lp-grid">
        {list.map((s) => {
          const st = STATUS[s.status] || null;
          return (
            <button className={`lp-card ${tone || ''}`} key={s.code} onClick={() => onOpenStock?.(s.code, s.name)}>
              <div className="lp-head">
                <b>{s.name}</b>
                <span className="lp-lb">{s.lianban}板</span>
              </div>
              <div className="lp-meta">
                <span className="muted">{s.industry}</span>
                {s.sealFund > 0 && <span className="muted">封单 {s.sealFund}亿</span>}
              </div>
              <div className="lp-tags">
                {st && <em className={`label ${st.cls}`}>{st.label}</em>}
                {s.promoted && <em className="label lab-warm">晋级</em>}
                {s.prevLianban ? <em className="muted">昨{s.prevLianban}板</em> : <em className="muted">昨未板</em>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LeadersPage({ onOpenStock }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () => api('leaders').then((d) => d && setData(d)).catch(() => {});
    load();
    if (CLOUD) return;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return (
      <div className="page">
        <h2 className="page-title">龙头分层</h2>
        <div className="empty">加载中…</div>
      </div>
    );
  }

  const { chief, second, branches, dropped, stats } = data;

  return (
    <div className="page">
      <h2 className="page-title">
        龙头分层
        <span className="page-tag">{data.date} · 全场最高 {data.globalMaxLianban} 板</span>
      </h2>

      <div className="cards" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="k">总龙头</div>
          <div className="v">{stats.chiefCount}</div>
          <div className="note">{chief.map((c) => `${c.name}${c.lianban}板`).join(' / ') || '无'}</div>
        </div>
        <div className="card">
          <div className="k">主线题材</div>
          <div className="v" style={{ fontSize: 15 }}>{(stats.mainThemes || []).slice(0, 3).join(' · ') || '无'}</div>
          <div className="note">共 {stats.themes} 个题材有连板</div>
        </div>
        <div className="card">
          <div className="k">昨日掉出</div>
          <div className={`v ${stats.droppedCount > 0 ? 'down' : ''}`}>{stats.droppedCount}</div>
          <div className="note">
            {stats.chiefBroken
              ? <span className="down">总龙头断板 → 警惕退潮</span>
              : stats.droppedCount > 0 ? '有龙头断板，看题材是否还有活口' : '龙头梯队完整'}
          </div>
        </div>
      </div>

      {!stats.hasPrev && (
        <div className="hint" style={{ marginBottom: 10 }}>
          首次运行暂无上一交易日快照，"新进/升级/降位"状态从下一个交易日起生效。
        </div>
      )}

      <Tier title="总龙头" hint={`全场最高 ${data.globalMaxLianban} 板，情绪风向标`} list={chief} onOpenStock={onOpenStock} tone="chief" />
      <Tier title="龙二" hint="主线题材内第二高度，总龙头断板时的接力候选" list={second} onOpenStock={onOpenStock} tone="second" />
      <Tier title="分支龙头" hint="各题材最高板（只统计 2 板以上）" list={branches.filter((b) => b.leader).map((b) => ({ ...b.leader, industry: b.industry, isMain: b.isMain }))} onOpenStock={onOpenStock} />

      <div className="panel">
        <h3>分支题材全景<span className="muted" style={{ fontSize: 11, fontWeight: 'normal', marginLeft: 8 }}>按最高板高度排序，主线标 ★</span></h3>
        <table className="tbl compact">
          <thead><tr><th>题材</th><th>高度</th><th>家数</th><th>分支龙头</th><th>龙二</th><th>状态</th></tr></thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.industry}>
                <td className="name">{b.isMain ? '★ ' : ''}{b.industry}</td>
                <td className="bold">{b.maxLianban}板</td>
                <td>{b.count}</td>
                <td>
                  {b.leader && (
                    <button className="link" onClick={() => onOpenStock?.(b.leader.code, b.leader.name)}>
                      {b.leader.name} <span className="muted">{b.leader.lianban}板</span>
                    </button>
                  )}
                </td>
                <td className="muted">{b.second ? `${b.second.name} ${b.second.lianban}板` : '-'}</td>
                <td>
                  {b.leader?.status && (
                    <em className={`label ${(STATUS[b.leader.status] || {}).cls || 'lab-cool'}`}>
                      {(STATUS[b.leader.status] || {}).label || b.leader.status}
                    </em>
                  )}
                </td>
              </tr>
            ))}
            {branches.length === 0 && <tr><td colSpan={6} className="empty">今日无 2 板以上股票</td></tr>}
          </tbody>
        </table>
      </div>

      {dropped.length > 0 && (
        <div className="panel">
          <h3>昨日池内今日掉出（断板）<span className="muted" style={{ fontSize: 11, fontWeight: 'normal', marginLeft: 8 }}>龙头断板是退潮先行信号</span></h3>
          <table className="tbl compact">
            <thead><tr><th>股票</th><th>题材</th><th>昨板高</th><th>原层级</th><th>昨封单</th></tr></thead>
            <tbody>
              {dropped.map((d) => (
                <tr key={d.code}>
                  <td className="name">{d.name}</td>
                  <td className="muted">{d.industry}</td>
                  <td className="bold down">{d.lianban}板</td>
                  <td><em className="label lab-freeze">{(STATUS[d.wasTier] || { label: d.wasTier }).label || d.wasTier}</em></td>
                  <td className="muted">{d.sealFund}亿</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint" style={{ marginTop: 8 }}>
            掉出的票不一定是坏票：若缩量回踩未破 MA10 且题材仍有活口，是回流候选（见"龙头回流"页）；
            若题材整体活口归零，视为该方向退潮。
          </div>
        </div>
      )}
    </div>
  );
}
