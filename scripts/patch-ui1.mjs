// UI 补丁：竞价业绩列 + 自选龙虎榜/业绩徽章 + 天梯封流比提示
import fs from 'node:fs';
const dir = new URL('../web/src/components/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// 1) AuctionPage 业绩列
{
  const p = dir + 'AuctionPage.jsx';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('业绩')) {
    s = s.replace('<th>流通市值</th>', '<th>流通市值</th><th>业绩</th>');
    s = s.replace(
      '<td>{fmtCap(s.floatCap)}</td>',
      `<td>{fmtCap(s.floatCap)}</td>
              <td>{s.earn ? <span className={\`\${s.earn.superExpect ? 'lb lb-high' : 'dir-tag'}\`} title={s.earn.content || ''}>{s.earn.type}{s.earn.add != null ? \`+\${s.earn.add}%\` : ''}</span> : '-'}</td>`
    );
    fs.writeFileSync(p, s);
    console.log('AuctionPage 业绩列 OK');
  } else console.log('AuctionPage 已有');
}

// 2) Watchlist 龙虎榜 + 业绩徽章
{
  const p = dir + 'Watchlist.jsx';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('earnMap')) {
    s = s.replace(
      "  const [expanded, setExpanded] = useState(null);",
      `  const [expanded, setExpanded] = useState(null);
  const [lhb, setLhb] = useState(new Set());
  const [earn, setEarn] = useState(new Map());
  useEffect(() => {
    api ? null : null;
    fetch('/api/lhb').then((r) => r.json()).then((d) => setLhb(new Set(d.codes || []))).catch(() => {});
    fetch('/api/earnings?days=3').then((r) => r.json()).then((d) => { const m = new Map(); (d || []).forEach((x) => m.set(x.code, x)); setEarn(m); }).catch(() => {});
  }, []);`
    );
    s = s.replace(
      '<td className="name">{s.name}<small>{s.code}</small></td>',
      `<td className="name">{s.name}<small>{s.code}</small>{lhb.has(s.code) && <span className="lhb-badge" title="昨日龙虎榜">🐉</span>}{earn.has(s.code) && <span className="earn-badge" title={earn.get(s.code).content}>📋{earn.get(s.code).type}</span>}</td>`
    );
    fs.writeFileSync(p, s);
    console.log('Watchlist 徽章 OK');
  } else console.log('Watchlist 已有');
}

// 3) ZtPool 封流比教学提示
{
  const p = dir + 'ZtPool.jsx';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('封流比怎么看')) {
    s = s.replace(
      '<div className="hint">共 {zt.length} 家涨停 · 最高 {tick?.maxLianban || 0} 板</div>',
      `<div className="hint">共 {zt.length} 家涨停 · 最高 {tick?.maxLianban || 0} 板 · 封流比(封单÷流通市值)>2%为强封(敢排队)，<2%为烂板(警惕炸板)，<1%勿碰</div>`
    );
    fs.writeFileSync(p, s);
    console.log('ZtPool 封流比提示 OK');
  } else console.log('ZtPool 已有');
}
console.log('UI 补丁完成');
