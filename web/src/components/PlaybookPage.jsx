// 开盘前操作手册：昨日复盘 + 今日竞价实况 + 大盘环境 → 场景化方案
import { useEffect, useState } from 'react';
import { api, CLOUD } from '../lib/api.js';

const LEVEL_META = {
  go: { cls: 'lb-high', text: '可做' },
  warn: { cls: 'lb-warn', text: '谨慎' },
  stop: { cls: 'lb-green', text: '回避' },
};

const ENV_META = {
  hot: { label: '重仓出击', cls: 'lab-hot' },
  warm: { label: '轻仓试错', cls: 'lab-warm' },
  cool: { label: '只看低吸', cls: 'lab-cool' },
  freeze: { label: '空仓观望', cls: 'lab-freeze' },
};

export default function PlaybookPage({ onOpenStock }) {
  const [pb, setPb] = useState(null);

  useEffect(() => {
    let stop = false;
    const load = () => api('playbook').then((d) => { if (!stop && d) setPb(d); }).catch(() => {});
    load();
    if (CLOUD) return () => { stop = true; };
    const t = setInterval(load, 10_000);   // 竞价时段 10 秒一刷，跟竞价雷达同频
    return () => { stop = true; clearInterval(t); };
  }, []);

  if (!pb) {
    return (
      <div className="page">
        <h2 className="page-title">开盘前操作手册</h2>
        <div className="empty">加载中…</div>
      </div>
    );
  }

  const em = ENV_META[pb.env.level] || ENV_META.cool;
  const live = pb.isLive;

  return (
    <div className="page">
      <h2 className="page-title">
        开盘前操作手册
        <span className="page-tag">
          {live ? '🔴 竞价实时（9:15-9:25）' : '预演模式（昨日收盘快照）'}
        </span>
      </h2>

      {/* 一页结论 */}
      <div className="panel" style={{ borderLeftWidth: 3, borderLeftColor: em.cls === 'lab-freeze' ? 'var(--down)' : 'var(--accent)' }}>
        <div className="pb-oneliner">{pb.oneLiner}</div>
        <div className="pb-envline">
          <span className={`v label ${em.cls}`} style={{ fontSize: 18 }}>{em.label}</span>
          <span className="muted">评分 {pb.env.score ?? '-'} · 周期【{pb.env.cycle}】</span>
          {pb.env.heightChange !== 0 && (
            <span className={pb.env.heightChange > 0 ? 'up' : 'down'}>
              空间高度 {pb.env.heightChange > 0 ? '↑' : '↓'}{Math.abs(pb.env.heightChange)} 板
            </span>
          )}
          {pb.env.chiefBroken && <span className="down">总龙头断板</span>}
        </div>
      </div>

      {/* 场景方案 */}
      {pb.scenes.length === 0 ? (
        <div className="panel"><div className="empty">暂无场景信号——等竞价数据（9:15 后）</div></div>
      ) : (
        pb.scenes.map((s) => (
          <div className="panel pb-scene" key={s.key}>
            <h3>{s.title}</h3>
            <div className="pb-scene-head">
              <span className={`lb ${LEVEL_META[s.level]?.cls || ''}`}>{LEVEL_META[s.level]?.text || s.level}</span>
              <b>{s.action}</b>
            </div>
            <div className="pb-scene-detail">{s.detail}</div>
            {(s.stock || (s.stocks && s.stocks.length)) && (
              <div className="pb-scene-stocks">
                {s.stock && (
                  <button className="mini" onClick={() => onOpenStock?.(s.stock.code, s.stock.name)}>
                    看 {s.stock.name} 详情 →
                  </button>
                )}
                {(s.stocks || []).map((x) => (
                  <button className="mini" key={x.code} onClick={() => onOpenStock?.(x.code, x.name)}>
                    {x.name} →
                  </button>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {/* 方向速查表 */}
      {pb.directionTable.length > 0 && (
        <div className="panel">
          <h3>竞价方向速查（强度 = 家数 × 2 + 平均高开 × 8 + 金额/5000万）</h3>
          <table className="tbl compact">
            <thead><tr><th>方向</th><th>竞价家数</th><th>平均高开</th><th>强度</th><th>龙头</th><th>与昨日关系</th><th>建议</th></tr></thead>
            <tbody>
              {pb.directionTable.map((d) => (
                <tr key={d.direction}>
                  <td className="name">{d.direction}</td>
                  <td className="bold">{d.count}</td>
                  <td className={d.avgGap > 0 ? 'up' : 'down'}>{d.avgGap > 0 ? '+' : ''}{d.avgGap}%</td>
                  <td className="bold">{d.strength}</td>
                  <td className="muted">{d.top || '-'}</td>
                  <td>
                    <span className={`lb ${d.relation === '主线延续' ? 'lb-high' : d.relation === '新方向' ? 'lb-warn' : ''}`}>
                      {d.relation}
                    </span>
                  </td>
                  <td className="muted">{d.advice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 昨日复盘基准 */}
      {pb.yesterdayPlan && (
        <div className="panel">
          <h3>昨日收盘复盘基准（本手册的输入）</h3>
          <div className="pb-yesterday">
            <div>
              <span className="lb">{pb.yesterdayPlan.action}</span>
            </div>
            <div>
              <span className="k">做多：</span>
              {(pb.yesterdayPlan.go || []).length
                ? pb.yesterdayPlan.go.map((g) => <span className="tp-dir-item" key={g}>{g}</span>)
                : <span className="muted">无</span>}
            </div>
            <div>
              <span className="k">回避：</span>
              {(pb.yesterdayPlan.avoid || []).length
                ? pb.yesterdayPlan.avoid.map((a) => <span className="tp-dir-item tp-avoid" key={a}>{a}</span>)
                : <span className="muted">无</span>}
            </div>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            手册 = 昨日复盘结论 × 今日竞价实况 × 大盘环境。竞价方向与昨日主线重叠 = 主线延续确认；出现全新方向 = 可能有新题材启动。
          </div>
        </div>
      )}
    </div>
  );
}
