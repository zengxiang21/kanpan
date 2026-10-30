// 外盘品种详情：实时报价 + 日K（从盘前页外围面板点击进入）
// 支持两类，用 code 前缀区分：
//   hf_NQ  → 外盘期货（新浪源），如纳指/标普/道指期货、富时A50期货
//   usIXIC → 美股指数现货（腾讯源），如纳斯达克/道琼斯/标普500
//
// 为什么单独一页而不复用 StockDetail：
//   StockDetail 深度绑定 A 股——/api/quotes 实时行情、量比/换手/流通市值/行业、
//   /api/kline 的 ^\d{6}$ 代码校验、以及 /api/peers 同行业对比，全部对外盘无意义。
// 为什么没有「分时」tab：
//   分钟线源实测全部不可用（新浪 Service not found、腾讯 param error），
//   不做一个假装有数据的按钮。详见 server/src/futures.js 注释。
import { useEffect, useState } from 'react';
import { fmtPrice, fmtPct, pctCls } from '../lib/format.js';
import CandleChart from './CandleChart.jsx';

// 对 A 股的映射方向，与盘前页外围面板口径一致
const A_SHARE_MAP = {
  NQ: '算力 / 光模块 / PCB / 液冷 / 电源 —— 科技股开盘风向标，近 23.5 小时连续交易',
  ES: '全球风险偏好先行指标，影响北向资金与整体开盘情绪',
  YM: '权重 / 价值风格先行，影响大盘蓝筹开盘',
  CHA50CFD: 'A股开盘前最重要先行指标，直接映射富时A50成分与沪深300权重',
  IXIC: '科技 / 成长风格风向标（现货为隔夜收盘结果，期货才是此刻预期）',
  DJI: '权重 / 价值风格',
  INX: '全球风险偏好',
};

export default function FutureDetail({ code, name, onBack }) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(null);
  const [last, setLast] = useState(null); // 日K最后一根，用于补齐腾讯源缺失的字段

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const d = await (await fetch(`/api/future/quote?code=${encodeURIComponent(code)}`)).json();
        if (stop) return;
        if (d.error) setErr(d.error);
        else { setQ(d); setErr(null); }
      } catch (e) {
        if (!stop) setErr(e.message);
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [code]);

  // 腾讯美股指数源不返回昨收/当日高低，用日K最后一根补上（语义明确，不猜字段位置）
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const d = await (await fetch(`/api/future/kline?code=${encodeURIComponent(code)}&limit=5`)).json();
        if (!stop && Array.isArray(d.bars) && d.bars.length) setLast(d.bars[d.bars.length - 1]);
      } catch { /* 补不全就空着，不阻塞主流程 */ }
    })();
    return () => { stop = true; };
  }, [code]);

  const isFuture = String(code).startsWith('hf_');
  const sym = String(code).replace(/^(hf_|us)/i, '').toUpperCase();
  // bars: [day, open, close, high, low, volume]
  const high = q?.high ?? (last ? last[3] : null);
  const low = q?.low ?? (last ? last[4] : null);
  const prevClose = q?.prevClose ?? null;

  return (
    <div className="page">
      <div className="stock-head">
        <button className="mini" onClick={onBack}>← 返回</button>
        <h2 className="page-title" style={{ margin: 0 }}>
          {q?.name || name || sym}
          <small className="muted" style={{ fontSize: 13, marginLeft: 6 }}>{code}</small>
          {q && q.price != null && <span className={`bold ${pctCls(q.pct)}`} style={{ fontSize: 22 }}>{fmtPrice(q.price)} {q.pct != null ? fmtPct(q.pct) : ''}</span>}
        </h2>
      </div>

      {err && <div className="panel"><div className="empty">行情加载失败：{err}</div></div>}

      {q && (
        <div className="cards">
          <div className="card"><div className="k">最高 / 最低</div><div className="v"><span className="up">{fmtPrice(high)}</span> / <span className="down">{fmtPrice(low)}</span></div></div>
          <div className="card"><div className="k">昨收</div><div className="v small-v">{fmtPrice(prevClose)}</div><div className="note">涨跌 {fmtPrice(q.change)}</div></div>
          <div className="card"><div className="k">行情时间</div><div className="v small-v">{q.time || '-'}</div><div className="note">{q.date || (last ? last[0] : '')}</div></div>
          <div className="card"><div className="k">品种</div><div className="v small-v">{isFuture ? '外盘期货' : '美股指数'}</div><div className="note">{isFuture ? 'CME 连续合约' : '现货指数'}</div></div>
        </div>
      )}

      <div className="panel">
        <div className="toolbar">
          <span className="muted" style={{ fontSize: 12 }}>日K（MA5/MA10/MA20）</span>
        </div>
        <CandleChart code={sym} name={q?.name || name} src={`/api/future/kline?code=${encodeURIComponent(code)}`} />
      </div>

      <div className="panel">
        <h3>对 A 股的映射</h3>
        <div className="reasons-cell">{A_SHARE_MAP[sym] || '外围风向标，影响次日 A 股开盘情绪'}</div>
        <div className="hint" style={{ marginTop: 8 }}>
          {isFuture
            ? '期货近乎 23.5 小时连续交易，A 股开盘时它已综合了隔夜美股与亚盘情绪，因此比美股现货收盘价更能指导当日开盘——现货是「昨晚的结果」，期货是「此刻的预期」。'
            : '现货指数反映的是隔夜收盘结果；若要看「此刻市场对美股的预期」，请对照上面的期货行情。'}
          <br />
          <span className="muted">
            数据来源：{isFuture ? '新浪外盘期货专用接口（GlobalFuturesDailyKLine + hf_ 实时）' : '腾讯行情（us 日K + qt 实时）'}。
            {isFuture && sym !== 'CHA50CFD' && '该品种新浪不提供成交量，故量柱为空，属数据源限制。'}
            无分时/分钟线：分钟线源实测全部不可用，未做假按钮。
          </span>
        </div>
      </div>
    </div>
  );
}

