import { useFlash } from '../lib/useFlash.js';
import { fmtPrice, fmtPct, pctCls, fmtAmount } from '../lib/format.js';

function IdxCard({ i }) {
  const flash = useFlash(i.price);
  return (
    <div className={`idx-card ${flash}`}>
      <div className="idx-name">{i.name}</div>
      <div className={`idx-price ${pctCls(i.pct)}`}>{fmtPrice(i.price)}</div>
      <div className={`idx-pct ${pctCls(i.pct)}`}>{fmtPct(i.pct)}</div>
      <div className="idx-sub">
        涨{i.advancers ?? '-'} / 跌{i.decliners ?? '-'} · {fmtAmount(i.amount)}
      </div>
    </div>
  );
}

export default function IndexStrip({ tick }) {
  const indices = tick?.indices || [];
  return (
    <div className="index-strip">
      {indices.map((i) => <IdxCard key={i.code} i={i} />)}
    </div>
  );
}
