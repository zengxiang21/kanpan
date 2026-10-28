// 补丁：/api/peers 路由 + StockDetail 板块内对比
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

{
  const p = root + 'server/src/index.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('/api/peers')) {
    s = s.replace(
      "import { runBacktest } from './backtest.js';",
      "import { runBacktest } from './backtest.js';\nimport { peersAnalysis } from './peers.js';"
    );
    s = s.replace(
      "// 业绩预告（即将披露 + 近期已披露，含超预期判断）",
      `// 板块内对比：同行业排名 + 能不能买评价
app.get('/api/peers', (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!/^[0-9]{6}$/.test(code)) return res.status(400).json({ error: 'bad code' });
  res.json(peersAnalysis(code, state.marketSweep, state.pools, state.tick));
});

// 业绩预告（即将披露 + 近期已披露，含超预期判断）`
    );
    fs.writeFileSync(p, s);
    console.log('index.js peers OK');
  }
}

{
  const p = root + 'web/src/components/StockDetail.jsx';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('/api/peers')) {
    s = s.replace(
      "import CandleChart from './CandleChart.jsx';",
      "import CandleChart from './CandleChart.jsx';\nimport { fmtPct as fPct } from '../lib/format.js';"
    );
    // 在面板末尾（K线 tab panel 之后）加板块内对比
    s = s.replace(
      "      </div>\n    </div>\n  );\n}",
      `      </div>

      {peers && (
        <div className="panel">
          <h3>板块内对比 · {peers.industry}（第 {peers.rank}/{peers.total} 名 · 板块涨停 {peers.limitUps} 家）</h3>
          <div className="plan-note">{peers.evaluation?.map((x, i) => <div key={i}>{i === 0 ? '' : '· '}{x}</div>)}</div>
          <table className="tbl compact">
            <thead><tr><th>板块内排名</th><th>名称</th><th>涨幅</th><th>连板</th><th>首封/封单</th></tr></thead>
            <tbody>
              {peers.top.map((t) => (
                <tr key={t.code} className={t.isMe ? 'row-up' : ''}>
                  <td className="muted">{peers.top.findIndex((x) => x.code === t.code) + 1}</td>
                  <td className="name">{t.name}<small>{t.code}</small>{t.isMe && <b> ←本票</b>}</td>
                  <td className={t.pct > 0 ? 'up' : t.pct < 0 ? 'down' : ''}>{fPct(t.pct)}</td>
                  <td>{t.lianban ? t.lianban + '板' : '-'}</td>
                  <td>{t.firstSeal ? t.firstSeal.slice(0, 5) + '/' + Math.round((t.sealFund || 0) / 1e8 * 100) / 100 + '亿' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint">只做板块前 2 名；排名第 3 以后的跟风票溢价最差</div>
        </div>
      )}
    </div>
  );
}`
    );
    // 加载 peers 数据 + state
    s = s.replace(
      "  const [q, setQ] = useState(null);",
      "  const [q, setQ] = useState(null);\n  const [peers, setPeers] = useState(null);"
    );
    s = s.replace(
      "  useEffect(() => {\n    let stop = false;\n    const load = async () => {\n      try {\n        const rows = await (await fetch('/api/quotes?codes=' + code)).json();",
      "  useEffect(() => {\n    fetch('/api/peers?code=' + code).then((r) => r.json()).then((d) => !d.error && setPeers(d)).catch(() => {});\n  }, [code]);\n\n  useEffect(() => {\n    let stop = false;\n    const load = async () => {\n      try {\n        const rows = await (await fetch('/api/quotes?codes=' + code)).json();"
    );
    fs.writeFileSync(p, s);
    console.log('StockDetail 板块对比 OK');
  }
}
console.log('完成');
