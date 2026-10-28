// 综合补丁：清尾 ROADMAP 剩余项（D1/D2/D3/D5/D6/B1/B4/E3/D4）
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const webDir = root + 'web/src/components/';

// ========== 1) KnowledgePage：D1 游资资料书单 / D3 文章扩充 / D5 视频+4 / D6 纪律详细 / D2 语录卡片化确认 ==========
{
  const p = webDir + 'KnowledgePage.jsx';
  let s = fs.readFileSync(p, 'utf8');

  // D5: 视频 +4（此前搜索验证过的真实 BV 号）
  if (!s.includes('BV18CPcz2E5z')) {
    s = s.replace(
      "  { cat: '复盘', title: '专业复盘工具教学', bv: 'BV1mf1WBFE9q', desc: '系统化复盘流程演示，配合本站收盘复盘页使用' },",
      `  { cat: '复盘', title: '专业复盘工具教学', bv: 'BV1mf1WBFE9q', desc: '系统化复盘流程演示，配合本站收盘复盘页使用' },
  { cat: '竞价', title: '集合竞价最强公式打板战法（保姆级）', bv: 'BV18CPcz2E5z', desc: '竞价量化打板战法，含选股公式思路' },
  { cat: '竞价', title: '通达信集合竞价打板技巧实战', bv: 'BV1k92RYEEuk', desc: '竞价实战教程详解' },
  { cat: '打板', title: '集合竞价就能打板：锁定能连板的强势股', bv: 'BV13i8jzZEqA', desc: '竞价选强势股的实战手法' },
  { cat: '打板', title: 'A股集合竞价六大要素', bv: 'BV1tx4y1N7fQ', desc: '竞价必懂的六个要素，配合竞价雷达验证' },`
    );
    console.log('D5 视频 +4 OK');
  }

  // D1: 游资资料/书单链接（HOTMONEY 后追加资料块数据）
  if (!s.includes('HM_REFS')) {
    s = s.replace(
      "const BOOKS = [",
      `const HM_REFS = [
  ['赵老哥 · 八年一万倍语录与复盘合集（B站/知乎搜索）', 'https://search.bilibili.com/all?keyword=%E8%B5%B5%E8%80%81%E5%93%A5%20%E5%A4%8D%E7%9B%98'],
  ['章盟主 · 大资金龙头主升手法（搜索）', 'https://search.bilibili.com/all?keyword=%E7%AB%A0%E7%9B%9F%E4%B8%BB%20%E9%BE%99%E5%A4%B4'],
  ['炒股养家心法完整版（雪球/知乎搜索）', 'https://xueqiu.com/k?q=%E7%82%92%E8%82%A1%E5%85%BB%E5%AE%B6%E5%BF%83%E6%B3%95'],
  ['作手新一 · 连板加速打法（搜索）', 'https://search.bilibili.com/all?keyword=%E4%BD%9C%E6%89%8B%E6%96%B0%E4%B8%80'],
  ['北京炒家 · 首板打法（搜索）', 'https://search.bilibili.com/all?keyword=%E5%8C%97%E4%BA%AC%E7%82%92%E5%AE%B6%20%E9%A6%96%E6%9D%BF'],
];
const BOOKS = [`
    );
    console.log('D1 HM_REFS OK');
  }

  // D3: 文章扩充
  if (!s.includes('ARTICLES.length')) {
    s = s.replace(
      "const ARTICLES = [\n  ['短线王牌：情绪流龙头战法与打板（雪球长文）', 'https://xueqiu.com/1899529380/306482390', '涵盖龙头、补涨、切换、情绪周期核心内容'],",
      `const ARTICLES = [
  ['短线王牌：情绪流龙头战法与打板（雪球长文）', 'https://xueqiu.com/1899529380/306482390', '涵盖龙头、补涨、切换、情绪周期核心内容'],
  ['情绪龙头战法：情绪周期的思考与操作节点（雪球）', 'https://xueqiu.com/k?q=%E6%83%85%E7%BB%AA%E5%91%A8%E6%9C%9F%20%E6%93%8D%E4%BD%9C%E8%8A%82%E7%82%B9', '周期阶段与节点操作'],
  ['龙头战法与空间板（知乎搜索）', 'https://www.zhihu.com/search?type=content&q=%E7%A9%BA%E9%97%B4%E6%9D%BF%20%E9%BE%99%E5%A4%B4%E6%88%98%E6%B3%95', '空间板与情绪风向标'],
  ['弱转强实战拆解（知乎搜索）', 'https://www.zhihu.com/search?type=content&q=%E5%BC%B1%E8%BD%AC%E5%BC%BA%20%E7%AB%9E%E4%BB%B7', '分歧转一致的买点案例'],
  ['断板回流与二波（知乎搜索）', 'https://www.zhihu.com/search?type=content&q=%E6%96%AD%E6%9D%BF%20%E5%9B%9E%E6%B5%81%20%E4%BA%8C%E6%B3%A2', '回流战法案例'],
  ['超短仓位管理与止损纪律（知乎搜索）', 'https://www.zhihu.com/search?type=content&q=%E8%B6%85%E7%9F%AD%E7%BA%BF%20%E4%BB%93%E4%BD%8D%20%E6%AD%A2%E6%8D%9F', '纪律体系'],`
    );
    console.log('D3 文章扩充 OK');
  }

  // D6: 交易纪律详细版（DISCIPLINE 数据 + 新 tab）
  if (!s.includes('const DISCIPLINE')) {
    s = s.replace(
      "const TERMS = [",
      `const DISCIPLINE = [
  ['仓位纪律', '单票不超 3 成；总仓位按环境评分：≥75 用 8 成、50-75 用 5 成、30-50 用 2 成、<30 空仓', '连板股只做一个，不并存两个高位票'],
  ['止损纪律', '打板票：炸板回封失败无条件走；半路票：破分时均价线走；低吸票：破预设支撑（MA5/昨涨停价）走', '所有票硬止损 -3%，不等反弹'],
  ['连亏纪律', '连亏 2 笔当日停手复盘；连亏 3 笔休息一天，只看不做', '复盘必写错误原因：是环境错、选股错还是执行错'],
  ['妖股末期纪律', '高位妖股仓位按"卖不出"管理；两度停牌核查的票直接拉黑；大股东减持公告=清仓信号', '参考中通客车案例：一字跌停 20 亿封单出逃无门'],
  ['利润兑现纪律', '浮盈 >10% 至少兑现一半让利润奔跑；竞价高开不及预期（<1%）竞价就走', '卖飞不可耻，坐过山车才可惜'],
  ['复盘纪律', '每天收盘后必写三行：今日主线/明日预案/今日错误；每周日统计胜率与盈亏比', '没有复盘的超短=赌博'],
];
const TERMS = [`
    );
    // 新 tab: 纪律
    s = s.replace(
      "  { key: 'quotes', label: '心法语录' },",
      "  { key: 'quotes', label: '心法语录' },\n  { key: 'discipline', label: '交易纪律' },"
    );
    s = s.replace(
      "      {tab === 'books' && (",
      `      {tab === 'discipline' && (
        <div className="panel">
          <h3>交易纪律详细版（调研高胜率超短手的共性规则）</h3>
          <table className="tbl compact">
            <thead><tr><th style={{ width: 120 }}>纪律</th><th>规则</th><th style={{ width: 260 }}>执行细节</th></tr></thead>
            <tbody>
              {DISCIPLINE.map((r) => (
                <tr key={r[0]}><td className="name">{r[0]}</td><td>{r[1]}</td><td className="muted case-plain">{r[2]}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="hint">纪律的本质：把"到时候怎么办"提前写好，盘中只执行不思考。配合交易日志每周统计执行率。</div>
        </div>
      )}

      {tab === 'books' && (`
    );
    console.log('D6 纪律 tab OK');
  }

  // D2: 语录卡片化（若尚未）
  if (!s.includes('quote-card')) {
    s = s.replace(
      "          <table className=\"tbl compact\">\n            <tbody>\n              {QUOTES.map((r, i) => (\n                <tr key={i}>\n                  <td className=\"name\" style={{ width: 100 }}>{r[0]}</td>\n                  <td style={{ fontSize: 13.5, lineHeight: 1.7 }}>{r[1]}</td>\n                </tr>\n              ))}\n            </tbody>\n          </table>",
      `          <div className="quote-grid">
            {QUOTES.map((r, i) => (
              <div className="quote-card" key={i}>
                <div className="quote-who">{r[0]}</div>
                <div className="quote-text">{r[1]}</div>
              </div>
            ))}
          </div>`
    );
    console.log('D2 语录卡片化 OK');
  }

  // D1: 游资 tab 里追加资料链接块（hotmoney tab 尾部）
  if (!s.includes('HM_REFS.map')) {
    s = s.replace(
      "      {tab === 'books' && (",
      `      {tab === 'hotmoney' && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <h3>游资资料 / 语录合集入口（搜索直达）</h3>
          <table className="tbl compact">
            <tbody>
              {HM_REFS.map((r) => (
                <tr key={r[0]}><td className="name"><a className="news-title" href={r[1]} target="_blank" rel="noreferrer">{r[0]} →</a></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'books' && (`
    );
    console.log('D1 游资资料块 OK');
  }

  fs.writeFileSync(p, s);
}

// ========== 2) D4: 文章站内阅读（书单文章行加"站内阅读"按钮 + 阅读面板） ==========
{
  const p = webDir + 'KnowledgePage.jsx';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('readUrl')) {
    s = s.replace(
      "export default function KnowledgePage() {\n  const [tab, setTab] = useState('quick');\n  const [video, setVideo] = useState(null);",
      `export default function KnowledgePage() {
  const [tab, setTab] = useState('quick');
  const [video, setVideo] = useState(null);
  const [readUrl, setReadUrl] = useState(null);
  const [readText, setReadText] = useState('');
  const [readErr, setReadErr] = useState(null);
  const openRead = (url) => {
    setReadUrl(url); setReadText(''); setReadErr(null); setTab('read');
    fetch('/api/article?url=' + encodeURIComponent(url)).then((r) => r.text()).then((t) => {
      if (t.startsWith('{')) { setReadErr('抓取失败（部分站点反爬），请点原链接阅读'); setReadText(''); }
      else setReadText(t.replace(/<script[\\s\\S]*?<\\/script>/g, '').replace(/<style[\\s\\S]*?<\\/style>/g, '').replace(/<[^>]+>/g, '\n').replace(/\\n{3,}/g, '\n\n').slice(0, 20000));
    }).catch((e) => setReadErr(e.message));
  };`
    );
    // 新 tab: read
    s = s.replace(
      "  { key: 'books', label: '书单文章' },",
      "  { key: 'books', label: '书单文章' },\n  { key: 'read', label: '阅读中' },"
    );
    s = s.replace(
      "      {tab === 'books' && (",
      `      {tab === 'read' && (
        <div className="panel">
          <h3>站内阅读 {readUrl ? <a className="news-title" href={readUrl} target="_blank" rel="noreferrer">原链接 →</a> : ''}</h3>
          {readErr ? <div className="hint warm-hint">抓取失败：{readErr}（可点原链接）</div> : readText ? (
            <pre className="case-plain" style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}>{readText}</pre>
          ) : <div className="empty">加载中…</div>}
        </div>
      )}

      {tab === 'books' && (`
    );
    // 书单文章行加"站内阅读"按钮（ARTICLES 块）
    s = s.replace(
      "                    <td className=\"name\"><a className=\"news-title\" href={r[1]} target=\"_blank\" rel=\"noreferrer\">{r[0]} →</a></td>",
      `                    <td className="name"><a className="news-title" href={r[1]} target="_blank" rel="noreferrer">{r[0]} →</a></td>\n                    <td><button className="mini" onClick={() => openRead(r[1])}>站内阅读</button></td>`
    );
    fs.writeFileSync(p, s);
    console.log('D4 站内阅读 OK');
  }
}

// ========== 3) B1: SectorsPage 题材卡片点击展开涨停股明细 ==========
{
  const p = webDir + 'SectorsPage.jsx';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('openTheme')) {
    s = s.replace(
      "export default function SectorsPage({ pools }) {\n  const [sectors, setSectors] = useState([]);",
      "export default function SectorsPage({ pools }) {\n  const [sectors, setSectors] = useState([]);\n  const [openTheme, setOpenTheme] = useState(null);"
    );
    s = s.replace(
      `          {themes.map((t) => (
            <div className="us-card" key={t.industry}>
              <div className="us-head"><b>{t.industry}</b><span className="up bold">{t.count} 家</span></div>
              <div className="muted" style={{ fontSize: 11 }}>最高 {t.lianban}板 · {t.top}</div>
            </div>
          ))}`,
      `          {themes.map((t) => (
            <button className="us-card dir-btn" key={t.industry} onClick={() => setOpenTheme(openTheme === t.industry ? null : t.industry)} title="点击展开该题材涨停股">
              <div className="us-head"><b>{t.industry}</b><span className="up bold">{t.count} 家</span></div>
              <div className="muted" style={{ fontSize: 11 }}>最高 {t.lianban}板 · {t.top}</div>
              {openTheme === t.industry && (
                <div style={{ marginTop: 6, textAlign: 'left' }}>
                  {(pools?.zt || []).filter((z) => z.industry === t.industry).map((z) => (
                    <div key={z.code} style={{ fontSize: 12 }}>{z.lianban > 1 ? z.lianban + '板·' : ''}{z.name} <span className="muted">{z.firstSeal || ''}</span></div>
                  ))}
                </div>
              )}
            </button>
          ))}`
    );
    fs.writeFileSync(p, s);
    console.log('B1 题材展开 OK');
  }
}

// ========== 4) B4: ZtPool 天梯 + Ranks 龙虎榜标记（fetch /api/lhb） ==========
{
  const p = webDir + 'ZtPool.jsx';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('lhbSet')) {
    s = s.replace(
      "import { useMemo, useState } from 'react';",
      "import { useEffect, useMemo, useState } from 'react';"
    );
    s = s.replace(
      "export default function ZtPool({ tick, pools, onWatch }) {\n  const [q, setQ] = useState('');",
      `export default function ZtPool({ tick, pools, onWatch }) {
  const [q, setQ] = useState('');
  const [lhb, setLhb] = useState(new Set());
  useEffect(() => {
    fetch('/api/lhb').then((r) => r.json()).then((d) => setLhb(new Set(d.codes || []))).catch(() => {});
  }, []);`
    );
    // 天梯 chip 名称加 🐉
    s = s.replace(
      '<b>{s.name}</b>\n                    <span className={pctCls(s.pct)}>',
      '<b>{s.name}{lhb.has(s.code) ? \' 🐉\' : \'\'}</b>\n                    <span className={pctCls(s.pct)}>'
    );
    // 列表 name 单元格加 🐉
    s = s.replace(
      '<td className="name"><span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}<small>{s.code}</small></span></td>\n            <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>\n            <td className={pctCls(s.pct)}>{fmtPct(s.pct)}</td>\n            <td>{fmtAmount(s.sealFund)}</td>',
      '<td className="name"><span className="name-link" onClick={() => onOpenStock(s.code, s.name)}>{s.name}{lhb.has(s.code) ? \' 🐉\' : \'\'}<small>{s.code}</small></span></td>\n            <td className={pctCls(s.pct)}>{fmtPrice(s.price)}</td>\n            <td className={pctCls(s.pct)}>{fmtPct(s.pct)}</td>\n            <td>{fmtAmount(s.sealFund)}</td>'
    );
    fs.writeFileSync(p, s);
    console.log('B4 ZtPool LHB OK');
  }
}

// ========== 5) E3: JournalPage 对账单粘贴解析 ==========
{
  const p = webDir + 'JournalPage.jsx';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('parseStatement')) {
    s = s.replace(
      "  const submit = (e) => {",
      `  // 对账单文本批量解析（同花顺/券商导出：每行含 日期 代码 名称 买/卖 价格 数量）
  const importText = () => {
    const text = prompt('粘贴对账单文本（每行一笔：日期 代码 名称 买/卖 价格 数量，空格分隔）');
    if (!text) return;
    const added = [];
    for (const line of text.split('\\n')) {
      const m = line.trim().match(/(\\\\d{4}-\\\\d{2}-\\\\d{2})[\\\\s\\\\t]+(\\\\d{6})[\\\\s\\\\t]+(\\\\S+)[\\\\s\\\\t]+(买|卖)[\\\\s\\\\t]+([\\\\d.]+)[\\\\s\\\\t]+(\\\\d+)/);
      if (m) added.push({ id: Date.now() + '-' + added.length, date: m[1], code: m[2], name: m[3], dir: m[4], price: +m[5], qty: +m[6], result: '', note: '对账单导入' });
    }
    if (added.length) { setEntries([...added, ...entries]); alert('导入 ' + added.length + ' 笔'); }
    else alert('未解析到记录：请确认每行格式为 日期 代码 名称 买/卖 价格 数量');
  };

  const submit = (e) => {`
    );
    s = s.replace(
      '<button className="mini" type="submit">记录</button>',
      '<button className="mini" type="submit">记录</button>\n        <button className="mini" type="button" onClick={importText}>批量导入对账单</button>'
    );
    fs.writeFileSync(p, s);
    console.log('E3 对账单解析 OK');
  }
}
console.log('综合补丁完成');
