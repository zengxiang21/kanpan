// 龙头分层动态池（E4）：总龙头 / 龙二 / 分支龙头 + 动态进出状态
// 视觉沿用涨停天梯的 stock-chip + lb 徽章，保持全站一致
import { useEffect, useState } from 'react';
import { api, CLOUD } from '../lib/api.js';

// 进出状态 → 小号彩字标签（11px，与 .tag-hot / .dir-tag 同级）
const STATUS = {
  new: { label: '新进', cls: 'lp-t-new' },
  up: { label: '升级', cls: 'lp-t-up' },
  hold: { label: '保持', cls: 'lp-t-hold' },
  down: { label: '降位', cls: 'lp-t-down' },
};

function LeaderChip({ s, onOpenStock }) {
  const st = STATUS[s.status];
  const q = s.quality || 0;
  // 质量分 → 配色（>=75 强 / >=60 中 / <60 弱）
  const qCls = q >= 75 ? 'lp-q-high' : q >= 60 ? 'lp-q-mid' : 'lp-q-low';
  return (
    <button
      className="stock-chip lp-cell"
      onClick={() => onOpenStock?.(s.code, s.name)}
      title={`${s.industry || ''} · ${s.lianban} 板 · 封单 ${s.sealFund || 0} 亿${s.sealRatio != null ? `（封流比 ${s.sealRatio}%）` : ''} · 首封 ${s.firstSeal || '-'}${s.prevLianban ? ` · 昨 ${s.prevLianban} 板` : ''} · 质量分 ${q} · 点击看详情`}
    >
      <b>
        {s.name}
        <span className={`lb ${s.lianban >= 3 ? 'lb-high' : ''}`}>{s.lianban}板</span>
        {s.isKawci && <em className="lp-tag lp-t-kawci">卡位</em>}
      </b>
      <small>
        {s.industry || '其他'}
        {s.sealFund > 0 ? ` · 封单 ${s.sealFund}亿` : ''}
        {s.sealRatio != null ? ` (${s.sealRatio}%)` : ''}
      </small>
      <small>
        <span className={`lp-q ${qCls}`}>{q}分</span>
        {st && <em className={`lp-tag ${st.cls}`}>{st.label}</em>}
        <span className="muted">首封 {s.firstSeal || '-'}</span>
      </small>
      {s.nextDay && <small className="lp-next">{s.nextDay.text}</small>}
    </button>
  );
}

function Tier({ title, hint, list, onOpenStock, extra }) {
  return (
    <div className="panel">
      <h3>
        {title}
        <span className="muted" style={{ fontSize: 11, fontWeight: 'normal', marginLeft: 8 }}>{hint}</span>
        {extra}
      </h3>
      {list.length === 0 ? <div className="empty">暂无</div> : (
        <div className="tianti-stocks">
          {list.map((s) => <LeaderChip key={s.code} s={s} onOpenStock={onOpenStock} />)}
        </div>
      )}
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
          <div className="k">空间高度</div>
          <div className="v">
            {data.globalMaxLianban}<small>板</small>
            {stats.heightChange !== 0 && (
              <small style={{ marginLeft: 6, color: stats.heightChange > 0 ? 'var(--up)' : 'var(--down)' }}>
                {stats.heightChange > 0 ? '↑' : '↓'}{Math.abs(stats.heightChange)}
              </small>
            )}
          </div>
          <div className="note">
            昨日 {data.prevMaxLianban} 板
            {stats.heightChange < 0 && <span className="down"> · 高度下降，退潮信号</span>}
            {stats.heightChange > 0 && <span className="up"> · 高度扩张</span>}
          </div>
        </div>
        <div className="card">
          <div className="k">卡位龙</div>
          <div className="v" style={{ fontSize: 20 }}>{stats.kawci || '无'}</div>
          <div className="note">{chief.length > 1 ? `同高度 ${chief.length} 只中质量分最高` : '无同高度竞争'}</div>
        </div>
        <div className="card">
          <div className="k">主线题材</div>
          <div className="v" style={{ fontSize: 15 }}>{(stats.mainThemes || []).slice(0, 3).join(' · ') || '无'}</div>
          <div className="note">共 {stats.themes} 个题材有连板</div>
        </div>
        <div className="card">
          <div className="k">断板 / 梯队风险</div>
          <div className={`v ${stats.chiefBroken ? 'down' : ''}`}>{stats.droppedCount}</div>
          <div className="note">
            {stats.chiefBroken
              ? <span className="down">总龙头断板 → 警惕退潮</span>
              : stats.droppedCount > 0 ? '有龙头断板，看题材是否还有活口' : '龙头梯队完整'}
          </div>
        </div>
      </div>

      {(stats.chiefBroken || (stats.gapThemes || []).length > 0) && (
        <div className="panel" style={{ marginBottom: 12, borderColor: stats.chiefBroken ? 'var(--down)' : 'var(--warn)' }}>
          <div className="lp-alert">
            {stats.chiefBroken && (
              <div className="down">
                <b>总龙头断板</b>：昨日 {data.prevMaxLianban} 板龙头今日未连板，全场高度降至 {data.globalMaxLianban} 板。
                次日不接力，等新周期启动信号（首板数量回升 + 新题材出现）。
              </div>
            )}
            {(stats.gapThemes || []).length > 0 && (
              <div className="warm-hint">
                <b>梯队断层</b>：{stats.gapThemes.join('、')} 存在高度断层（缺中间板），持续性差，慎追。
              </div>
            )}
          </div>
        </div>
      )}

      {!stats.hasPrev && (
        <div className="hint" style={{ marginBottom: 10 }}>
          首次运行暂无上一交易日快照，"新进/升级/降位"状态从下一个交易日起生效。
        </div>
      )}

      <Tier
        title="总龙头"
        hint={`全场最高 ${data.globalMaxLianban} 板，情绪风向标`}
        list={chief}
        onOpenStock={onOpenStock}
      />
      <Tier
        title="龙二"
        hint="主线题材内第二高度，总龙头断板时的接力候选"
        list={second}
        onOpenStock={onOpenStock}
      />

      <div className="panel">
        <h3>
          分支龙头
          <span className="muted" style={{ fontSize: 11, fontWeight: 'normal', marginLeft: 8 }}>各题材最高板（只统计 2 板以上）· ★ = 主线</span>
        </h3>
        <table className="tbl compact">
          <thead><tr><th>题材</th><th>高度</th><th>家数</th><th>梯队</th><th>分支龙头</th><th>龙二</th><th>状态</th></tr></thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.industry}>
                <td className="name">{b.isMain ? '★ ' : ''}{b.industry}</td>
                <td><span className={`lb ${b.maxLianban >= 3 ? 'lb-high' : ''}`}>{b.maxLianban}板</span></td>
                <td>{b.count}</td>
                <td className="reasons-cell">
                  {(b.stocks || []).map((s, i) => (
                    <span key={s.code}>
                      {i > 0 && <span className="muted"> · </span>}
                      <span className="name-link" onClick={() => onOpenStock?.(s.code, s.name)}>{s.name}</span>
                      <span className="muted">{s.lianban}板</span>
                    </span>
                  ))}
                  {(b.gaps || []).length > 0 && (
                    <em className="lp-tag lp-t-gap" style={{ marginLeft: 6 }}>缺{(b.gaps || []).join('/')}</em>
                  )}
                </td>
                <td>
                  {b.leader && (
                    <>
                      <button className="link" onClick={() => onOpenStock?.(b.leader.code, b.leader.name)}>
                        {b.leader.name}
                      </button>
                      <span className={`lp-q ${b.leader.quality >= 75 ? 'lp-q-high' : b.leader.quality >= 60 ? 'lp-q-mid' : 'lp-q-low'}`} style={{ marginLeft: 5 }}>
                        {b.leader.quality}分
                      </span>
                    </>
                  )}
                </td>
                <td className="muted">{b.second ? `${b.second.name} ${b.second.lianban}板` : '-'}</td>
                <td>
                  {b.leader?.status && (
                    <em className={`lp-tag ${(STATUS[b.leader.status] || {}).cls || 'lp-t-hold'}`}>
                      {(STATUS[b.leader.status] || {}).label || b.leader.status}
                    </em>
                  )}
                </td>
              </tr>
            ))}
            {branches.length === 0 && <tr><td colSpan={7} className="empty">今日无 2 板以上股票</td></tr>}
          </tbody>
        </table>
        <div className="hint" style={{ marginTop: 8 }}>
          质量分综合 连板高度/封流比/封板时间/题材地位/梯队支撑 五个维度；同高度多只时质量分最高者为卡位龙。
          断层 = 有 N 板但缺 N-1 板，梯队不完整持续性差。
        </div>
      </div>

      {dropped.length > 0 && (
        <div className="panel">
          <h3>
            昨日池内今日掉出（断板）
            <span className="muted" style={{ fontSize: 11, fontWeight: 'normal', marginLeft: 8 }}>龙头断板是退潮先行信号</span>
          </h3>
          <table className="tbl compact">
            <thead><tr><th>股票</th><th>题材</th><th>昨板高</th><th>原层级</th><th>昨封单</th></tr></thead>
            <tbody>
              {dropped.map((d) => (
                <tr key={d.code} className={d.wasTop ? 'row-today' : ''}>
                  <td className="name">
                    <span className="name-link" onClick={() => onOpenStock?.(d.code, d.name)}>{d.name}</span>
                    {d.wasTop && <em className="lp-tag lp-t-gap" style={{ marginLeft: 5 }}>高度真空</em>}
                  </td>
                  <td className="muted">{d.industry}</td>
                  <td><span className="lb lb-high">{d.lianban}板</span></td>
                  <td className="muted">{d.wasTier ? { chief: '总龙头', second: '龙二', branch: '分支龙头' }[d.wasTier] : '-'}</td>
                  <td className="muted">{d.sealFund}亿</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint" style={{ marginTop: 8 }}>
            掉出的票不一定是坏票：若缩量回踩未破 MA10 且题材仍有活口，是回流候选（见"龙头回流"页）；若题材整体活口归零，视为该方向退潮。
          </div>
        </div>
      )}
    </div>
  );
}
