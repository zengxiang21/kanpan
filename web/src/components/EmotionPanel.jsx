import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
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
  const chartRef = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    chart.current = echarts.init(chartRef.current);
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!chart.current) return;
    const dist = tick?.lianbanDist || {};
    const keys = Object.keys(dist).map(Number).sort((a, b) => a - b);
    const x = keys.map((k) => (k >= 10 ? '10板+' : `${k === 1 ? '' : k}板`));
    const y = keys.map((k) => dist[k]);
    chart.current.setOption({
      grid: { left: 40, right: 12, top: 30, bottom: 26 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: x, axisLabel: { color: '#8b949e' }, axisLine: { lineStyle: { color: '#30363d' } } },
      yAxis: { type: 'value', axisLabel: { color: '#8b949e' }, splitLine: { lineStyle: { color: '#21262d' } } },
      series: [
        {
          type: 'bar',
          data: y,
          barWidth: '55%',
          itemStyle: {
            borderRadius: [3, 3, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#ff7b72' },
              { offset: 1, color: '#b62324' },
            ]),
          },
          label: { show: true, position: 'top', color: '#e6edf3' },
        },
      ],
    });
  }, [tick?.lianbanDist]);

  if (!tick) return <div className="empty">连接行情服务中…</div>;
  const t = tick;
  const zt = [...(pools?.zt || [])].sort((a, b) => (b.lianban || 1) - (a.lianban || 1));
  const ladder = zt.slice(0, 8);

  return (
    <div className="emotion">
      <div className="cards">
        <div className="card">
          <div className="k">市场情绪</div>
          <div className={`v label ${LABEL_STYLE[t.emotionLabel] || 'lab-neutral'}`}>{t.emotionLabel}</div>
          <div className="note">{comment(t)}</div>
        </div>
        <div className="card"><div className="k">涨停</div><div className="v up">{t.ztCount}</div><div className="note">炸板 {t.zbCount} 家</div></div>
        <div className="card"><div className="k">炸板率</div><div className="v">{t.zhaRate != null ? (t.zhaRate * 100).toFixed(0) + '%' : '-'}</div><div className="note">{t.zhaRate != null && t.zhaRate > 0.3 ? '封板质量差' : '封板质量正常'}</div></div>
        <div className="card"><div className="k">跌停</div><div className="v down">{t.dtCount}</div><div className="note">亏钱效应观察</div></div>
        <div className="card"><div className="k">最高连板</div><div className="v">{t.maxLianban || 0}<small>板</small></div><div className="note">空间高度</div></div>
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

      <div className="row2">
        <div className="panel">
          <h3>连板分布</h3>
          <div ref={chartRef} className="chart" />
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
