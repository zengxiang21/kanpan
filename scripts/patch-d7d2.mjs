// D7 字体收尾 + D2 心法语录卡片化
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

{
  const p = root + 'web/src/styles.css';
  let s = fs.readFileSync(p, 'utf8');
  s = s.split('font-size: 12.5px;').join('font-size: 13px;');
  fs.writeFileSync(p, s);
  console.log('D7 字体统一完成');
}

{
  const p = root + 'web/src/components/KnowledgePage.jsx';
  let s = fs.readFileSync(p, 'utf8');
  const start = s.indexOf("      {tab === 'quotes' && (");
  const end = s.indexOf("      {tab === 'books' && (");
  if (start < 0 || end < 0) { console.error('quotes 块定位失败'); process.exit(1); }
  const nw = `      {tab === 'quotes' && (
        <div className="panel">
          <h3>心法语录（网络流传整理 · 每天开盘前读一遍）</h3>
          <div className="quote-grid">
            {QUOTES.map((r, i) => (
              <div className="quote-card" key={i}>
                <div className="quote-who">{r[0]}</div>
                <div className="quote-text">{r[1]}</div>
              </div>
            ))}
          </div>
          <div className="hint">语录为流传版本整理，出处归属仅供参考；真正的"心法"是自己的交易日志——用交易日志页每天记录对错，三个月后你自己的心法比任何语录都值钱。</div>
        </div>
      )}

`;
  s = s.slice(0, start) + nw + s.slice(end);
  fs.writeFileSync(p, s);
  console.log('D2 心法卡片化完成');
}
