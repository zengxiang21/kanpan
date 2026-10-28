// Ranks.jsx 补丁：LHB 徽章 + 传递
import fs from 'node:fs';
const p = new URL('../web/src/components/Ranks.jsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let s = fs.readFileSync(p, 'utf8');
s = s.split('{s.name}<small>{s.code}</small>').join("{s.name}{lhb.has(s.code) ? ' 🐉' : ''}<small>{s.code}</small>");
s = s.replace(
  '<RankTable title="涨幅榜" rows={tick.gainers || []} keyName="量比" onWatch={onWatch} onOpenStock={onOpenStock} />',
  '<RankTable title="涨幅榜" rows={tick.gainers || []} keyName="量比" onWatch={onWatch} onOpenStock={onOpenStock} lhb={lhb} />'
);
s = s.replace(
  '<RankTable title={volTitle} rows={tick.volRatio || []} keyName={volKey} onWatch={onWatch} onOpenStock={onOpenStock} />',
  '<RankTable title={volTitle} rows={tick.volRatio || []} keyName={volKey} onWatch={onWatch} onOpenStock={onOpenStock} lhb={lhb} />'
);
s = s.replace(
  '<RankTable title="成交额榜" rows={tick.amountTop || []} keyName="成交额" onWatch={onWatch} onOpenStock={onOpenStock} />',
  '<RankTable title="成交额榜" rows={tick.amountTop || []} keyName="成交额" onWatch={onWatch} onOpenStock={onOpenStock} lhb={lhb} />'
);
fs.writeFileSync(p, s);
console.log('Ranks LHB 完成:', s.includes('🐉'), (s.match(/lhb={lhb}/g) || []).length);
