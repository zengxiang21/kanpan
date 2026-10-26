import { fmtPrice, fmtPct, pctCls, fmtAmount } from '../lib/format.js';

export default function IndexStrip({ tick }) {
  const indices = tick?.indices || [];
  return (
    <div className="index-strip">
      {indices.map((i) => (
        <div className="idx-card" key={i.code}>
          <div className="idx-name">{i.name}</div>
          <div className={`idx-price ${pctCls(i.pct)}`}>{fmtPrice(i.price)}</div>
          <div className={`idx-pct ${pctCls(i.pct)}`}>{fmtPct(i.pct)}</div>
          <div className="idx-sub">
            涨{i.advancers ?? '-'} / 跌{i.decliners ?? '-'} · {fmtAmount(i.amount)}
          </div>
        </div>
      ))}
    </div>
  );
}
