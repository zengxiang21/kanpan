// 超短知识库：战法速查 / 视频课(B站内嵌) / 实战案例(时间轴拆解) / 书单文章
import { useState } from 'react';

const TABS = [
  { key: 'quick', label: '战法速查' },
  { key: 'video', label: '视频课' },
  { key: 'cases', label: '实战案例' },
  { key: 'books', label: '书单与文章' },
];

// ---------- 视频课（B站内嵌播放器，点击才加载） ----------
const VIDEOS = [
  { cat: '系统课', title: '短线打板战法龙头战法核心（全15讲）', bv: 'BV1UcmtBGE39', desc: '超短高手复盘流程 / 情绪周期细分阶段 / 龙头战法买点，成体系' },
  { cat: '系统课', title: '短线核心玩法：情绪周期一个视频讲完', bv: 'BV1trnC6dExP', desc: '情绪周期与资金曲线结合的实战视角' },
  { cat: '竞价', title: '零基础打板教学之集合竞价', bv: 'BV1GtyUBeEw4', desc: '竞价基础知识 + 打板入门，适合从零开始' },
  { cat: '竞价', title: '如何看懂集合竞价', bv: 'BV14wWazyEFo', desc: '竞价六大要素，配合本站竞价雷达使用' },
  { cat: '打板', title: '提升打板胜率之 PK 与卡位', bv: 'BV1h9pF61EAc', desc: '同题材多票竞争时如何选龙头（卡位战法）' },
  { cat: '打板', title: '集合竞价挂单实操', bv: 'BV1fe28BeE8S', desc: '竞价打板/排单的具体挂单手法' },
  { cat: '复盘', title: '短线复盘：竞价 + 炸板大面股分析', bv: 'BV1ce4y1x7mf', desc: '真实复盘案例：竞价怎么做、炸板大面怎么防' },
  { cat: '复盘', title: '专业复盘工具教学', bv: 'BV1mf1WBFE9q', desc: '系统化复盘流程演示，配合本站收盘复盘页使用' },
];

// ---------- 实战案例 ----------
const CASES = [
  {
    title: '案例一：主线龙头 首板 → 3板（打板 + 半路 + 持股）',
    bg: '背景：市场涨停 60 家、最高 3 板，某题材受政策催化，板块当日 8 家涨停、3 家首板。情绪周期定位=发酵期。',
    timeline: [
      ['9:24', '龙头 A 竞价高开 4.2%、竞价量比 5.8、金额 6800万 —— 竞价雷达评分 Top1，符合"高开2~7%+带量"', '竞价买入 1/2 仓（发酵期龙头首板，确定性最高的阶段）'],
      ['9:37', '开盘回落至分时均价线 3.1% 处缩量止跌，未破均价 —— 半路加仓条件成立', '加仓 1/4 仓（半路点：站稳均价线 + 放量）'],
      ['10:02', '首次触板，封单 8000万 ≈ 流通市值 3.2%（封流比 >2% 属强封）', '持有不动；若封单/流通 <1.5% 需警惕烂板'],
      ['13:40', '板块第二只票 B 涨停，板块效应确认（梯队 2 层）', '继续持有，弱转强预期升温'],
      ['次日 9:25', 'A 竞价高开 6.1% + 量比 4（昨日涨停溢价 +2.8%）→ 弱转强确认', '不卖；按交易计划卡"高开5~7%：持有为主"执行'],
      ['次日 10:15', 'A 二连板封死，龙虎榜出现知名游资净买', '锁仓，止损上移至昨日涨停价'],
      ['第三日 9:25', 'A 竞价仅高开 1.2%（明显低于预期）', '竞价即减半 —— "断板止盈/低于预期走"纪律'],
      ['第三日 10:30', '冲高 7% 后回落跌破分时均价线', '清仓。全程收益约 +18%，回撤仅 -2%'],
    ],
    keys: ['发酵期才打首板（环境定仓位）', '竞价量比是买点的第一验证', '封流比判断封板质量', '次日竞价不及预期先减半，不等冲高'],
    mistakes: ['早盘回落时 panic 卖在均价线下方 2%', '二连板后贪心加仓（超计划仓位）', '第三日幻想"还能反包"错过竞价离场点'],
  },
  {
    title: '案例二：弱转强 —— 昨日烂板股的竞价抢筹',
    bg: '背景：龙头 A 昨日 14:30 炸板、尾盘回封但封单弱（炸板 3 次），市场情绪=分歧期。分歧期弱转强是确定性最高的买点之一。',
    timeline: [
      ['盘前', '自选 A 加入交易计划卡；预演情景：昨日烂板 + 今日高开≥2% + 竞价量比>3 = 弱转强确认', '9:15-9:20 只观察不挂单（9:20 前可撤单，虚假挂单多）'],
      ['9:21', '竞价涨幅 +1.0%，量比 2 —— 偏弱，不动'],
      ['9:23', '竞价快速拉到 +3.5%，量比 4.2，金额 3200万 —— 转强确认', '9:24 集合竞价委托买入（挂价比当前竞价高 1%，确保成交）'],
      ['9:30', '开盘 +4.8%，第一分钟放量上攻', '持有；止损设在分时均价线下方'],
      ['9:52', '冲高 +8.9% 未封板，量能开始衰减', '兑现 1/2（未封板的高位票不稳定）'],
      ['10:20', '封板，封成比 4', '剩余持仓拿到尾盘，收盘封死 → 次日按计划卡执行'],
    ],
    keys: ['弱转强的三要素：昨日分歧 + 今日高开 2% 以上 + 竞价带量', '9:20 前的竞价数据会骗人', '分歧期买点质量 > 发酵期追高', '未封板的冲高先落袋一半'],
    mistakes: ['9:19 被"虚假高开"骗进去（9:20 撤单后竞价跳水）', '转强确认后犹豫没上，追在 +7% 高位'],
  },
  {
    title: '案例三：龙头断板回流（二波低吸）',
    bg: '背景：龙头 A 4 板后断板（第5日未涨停，收 -3.5%），但板块仍有 3 家涨停（题材未死）。情绪=发酵转分歧。这正是"龙头回流页"扫描的形态。',
    timeline: [
      ['断板日', 'A 收 -3.5%，量能萎缩至高峰期 55% —— 缩量回调=筹码没散', '加入"回流候选"，不抄底（断板当天不接）'],
      ['断板次日', 'A 低开 -2%，全日缩量震荡，收盘 -1.2%，守住了 5 日线', '继续观察：回流的两个前提（缩量+题材活口）都在'],
      ['第三日 9:25', 'A 竞价高开 +2.8%，量比 3.5 —— 回流确认信号', '竞价买 1/2 仓（回流买点：竞价确认，不等盘中）'],
      ['第三日 10:00', '放量上攻 +7%，板块跟风票同步拉升', '加仓；若当日封板 → 按连板股预案持有'],
      ['第三日 14:00', '冲高 9.2% 未能封板，板块内其他票开始回落', '清仓兑现 —— 回流是博二波预期，不是无限持有'],
    ],
    keys: ['回流三前提：龙头缩量回调 + 未破 5/10 日线 + 板块仍有活口', '竞价高开 2% 以上 = 回流确认的第一信号', '回流目标=二波预期，滞涨/板块转弱立刻走'],
    mistakes: ['断板当天就接飞刀（正确做法：等缩量企稳+竞价确认）', '回流当日贪心拿到尾盘被炸'],
  },
];

// ---------- 书单与文章 ----------
const BOOKS = [
  ['股票大作手回忆录', '利弗莫尔趋势与关键点思想，所有超短体系的源头'],
  ['十年一梦（青泽）', '国内期货操盘手的实战心路，仓位与纪律的教科书'],
  ['缠中说禅·教你炒股票 108 课', '区间套/背驰/级别，技术分析的底层框架'],
  ['短线交易大师（奥德里奇）', '日内交易的进出场纪律'],
];
const ARTICLES = [
  ['短线王牌：情绪流龙头战法与打板（雪球长文）', 'https://xueqiu.com/1899529380/306482390', '涵盖龙头、补涨、切换、情绪周期核心内容'],
  ['情绪龙头战法——情绪周期的思考与操作节点（豆瓣）', 'https://m.douban.com/note/856515374', '周期阶段与操作节点的对应关系'],
  ['情绪周期才是龙头战法的根基（网易视频）', 'https://www.163.com/v/video/VF6NTE89A.html', '视频讲解'],
];

// ---------- 战法速查数据 ----------
const CYCLE = [
  { stage: '冰点', sign: '涨停 <20，连板断层，昨日涨停溢价 <0', play: '空仓或只做超跌反抽；盯首板尝试新方向', risk: '手痒抄底高位票' },
  { stage: '启动', sign: '首板增多（30~50），出现 2~3 板，溢价转正', play: '试错新题材首板、低位二板', risk: '仓位过重' },
  { stage: '发酵', sign: '涨停 50~100，梯队完整，龙头确立', play: '打龙头、做跟风套利，主流题材重仓', risk: '乱做非主流' },
  { stage: '高潮', sign: '涨停 >100，最高板 6+，溢价 >3%', play: '持有为主，龙头锁仓；新增仓位只做主流', risk: '追高位接力' },
  { stage: '分歧', sign: '炸板率 >35%，高位板大面积开板，溢价回落', play: '兑现为主，只做分歧转一致的卡位', risk: '分歧日接力' },
  { stage: '退潮', sign: '跌停增多，高位断板补跌，亏钱效应扩散', play: '空仓看戏，等冰点；做也只能低吸超跌', risk: '觉得"跌多了"去接' },
];
const AUCTION = [
  ['高开抢筹', '热点题材 + 高开 2%~7% + 竞价量比 ≥3 + 竞价金额 ≥2000万', '开盘直接竞价买入，赌当日加速'],
  ['弱转强', '昨日烂板/炸板股，今日竞价高开 ≥2% 且带量', '分歧转一致的经典买点，溢价率高'],
  ['一字防坑', '一字板买不进；开板一字（涨停价大量成交）才有关注价值', '别挂一字单占资金'],
  ['竞价弱于预期', '昨日强势股竞价低开/高开不足 1%', '直接从自选剔除，当日不看'],
];
const BUYS = [
  ['打板', '涨幅触及涨停价 + 封单快速增长 + 板块联动（同板块 ≥3 只涨停）', '排单在涨停价；封流比 <2% 的烂板不排'],
  ['半路', '站上分时均价线 + 放量突破 10:00 前平台高点', '半路仓位 < 打板仓位；突破失败立即走'],
  ['低吸', '强势股缩量回踩分时均价线 / 5日线 / 昨日涨停价，企稳不创分时新低', '挂单在支撑位下方 0.5%；破位止损'],
  ['套利板', '主线题材有高度板压制时，低位首板的半路/竞价', '吃板块溢价的确定性部分，不贪连板'],
];
const SELLS = [
  ['炸板即走', '打板成交后炸板，回封失败 → 无条件走', '超短第一纪律'],
  ['冲高回落', '盘中涨幅从 >5% 回落至 <3% 且量能跟不上', '至少减半'],
  ['尾盘跳水', '14:30 后跌破分时均价线且收不回', '不留弱势票过夜'],
  ['断板止盈', '连板股次日竞价低于预期（高开 <1%）', '竞价就走，别等冲高'],
];
const TERMS = [
  ['空间板', '全市场最高连板高度的那只，情绪风向标'],
  ['卡位', '同题材中率先涨停抢占龙头地位'],
  ['补涨', '龙头打出高度后，同题材低位股跟涨'],
  ['辨识度', '资金和散户都认识的票（热榜/成交额/龙虎榜常客）'],
  ['断板', '连板后某天没能继续涨停'],
  ['回流', '断板回调后资金再次回来做二波'],
  ['封成比', '封单金额 / 当日成交金额，衡量封板决心'],
  ['封流比', '封单金额 / 流通市值，>2% 为强封'],
  ['晋级率', '昨日 N 板今日 N+1 板的比例，情绪接力强度'],
];

export default function KnowledgePage() {
  const [tab, setTab] = useState('quick');
  const [video, setVideo] = useState(null);

  return (
    <div className="page">
      <h2 className="page-title">
        超短知识库
        <span className="page-tag">内容仅供学习，不构成投资建议；视频为第三方 UP 主内容</span>
      </h2>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'quick' && (
        <>
          <div className="panel" style={{ marginBottom: 12 }}>
            <h3>情绪周期六阶段（先看环境再出手）</h3>
            <table className="tbl compact">
              <thead><tr><th>阶段</th><th>识别信号</th><th>打法</th><th>最大风险</th></tr></thead>
              <tbody>
                {CYCLE.map((r) => (
                  <tr key={r.stage}><td className="name">{r.stage}</td><td>{r.sign}</td><td>{r.play}</td><td className="muted">{r.risk}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row2" style={{ marginBottom: 12 }}>
            <div className="panel">
              <h3>集合竞价战法（9:15-9:25）</h3>
              <table className="tbl compact">
                <thead><tr><th>战法</th><th>识别</th><th>操作</th></tr></thead>
                <tbody>
                  {AUCTION.map((r) => (<tr key={r[0]}><td className="name">{r[0]}</td><td>{r[1]}</td><td className="muted">{r[2]}</td></tr>))}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <h3>买点四式（含套利板）</h3>
              <table className="tbl compact">
                <thead><tr><th>买点</th><th>确认条件</th><th>执行</th></tr></thead>
                <tbody>
                  {BUYS.map((r) => (<tr key={r[0]}><td className="name">{r[0]}</td><td>{r[1]}</td><td className="muted">{r[2]}</td></tr>))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="row2">
            <div className="panel">
              <h3>卖点纪律（纪律 &gt; 预测）</h3>
              <table className="tbl compact">
                <thead><tr><th>信号</th><th>动作</th></tr></thead>
                <tbody>
                  {SELLS.map((r) => (<tr key={r[0]}><td className="name">{r[0]}</td><td>{r[1]}</td></tr>))}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <h3>术语表</h3>
              <table className="tbl compact">
                <tbody>
                  {TERMS.map((r) => (<tr key={r[0]}><td className="name" style={{ width: 90 }}>{r[0]}</td><td className="muted">{r[1]}</td></tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'video' && (
        <div className="row2">
          <div className="panel">
            <h3>课程列表（点击加载播放器 · B站内嵌）</h3>
            <div className="video-list">
              {VIDEOS.map((v) => (
                <button className={`video-item ${video?.bv === v.bv ? 'active' : ''}`} key={v.bv} onClick={() => setVideo(v)}>
                  <span className="video-cat">{v.cat}</span>
                  <span className="video-title">{v.title}</span>
                  <span className="video-desc">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            {video ? (
              <>
                <h3>{video.title}</h3>
                <div className="video-frame">
                  <iframe
                    src={`https://player.bilibili.com/player.html?bvid=${video.bv}&autoplay=0&danmaku=0`}
                    scrolling="no" frameBorder="no" allowFullScreen="true" title={video.title}
                  />
                </div>
                <div className="hint">{video.desc} · 若播放器被浏览器拦截，<a className="news-title" href={`https://www.bilibili.com/video/${video.bv}`} target="_blank" rel="noreferrer">去B站观看 →</a></div>
              </>
            ) : <div className="empty">从左侧选一节课开始（共 {VIDEOS.length} 节）</div>}
            <div className="hint" style={{ marginTop: 8 }}>
              更多可在B站搜索：<a className="news-title" href="https://search.bilibili.com/all?keyword=%E6%89%93%E6%9D%BF%E6%95%99%E5%AD%A6" target="_blank" rel="noreferrer">打板教学</a> ·
              <a className="news-title" href="https://search.bilibili.com/all?keyword=%E9%BE%99%E5%A4%B4%E6%88%98%E6%B3%95" target="_blank" rel="noreferrer">龙头战法</a> ·
              <a className="news-title" href="https://search.bilibili.com/all?keyword=%E8%B6%85%E7%9F%AD%E7%BA%BF%E5%A4%8D%E7%9B%98" target="_blank" rel="noreferrer">超短复盘</a>
              （带"荐股/带单/收费群"的一律跳过）
            </div>
          </div>
        </div>
      )}

      {tab === 'cases' && (
        <>
          {CASES.map((c) => (
            <div className="panel" style={{ marginBottom: 12 }} key={c.title}>
              <h3>{c.title}</h3>
              <div className="plan-note">{c.bg}</div>
              <table className="tbl compact">
                <thead><tr><th style={{ width: 110 }}>时间</th><th>盘面</th><th style={{ width: 280 }}>决策（对应系统功能）</th></tr></thead>
                <tbody>
                  {c.timeline.map((r, i) => (
                    <tr key={i}>
                      <td className="name">{r[0]}</td>
                      <td className="case-plain">{r[1]}</td>
                      <td className="muted case-plain">{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="case-keys">
                <div><b className="up">要点：</b>{c.keys.join('；')}</div>
                <div><b className="down">常见错误：</b>{c.mistakes.join('；')}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'books' && (
        <div className="row2">
          <div className="panel">
            <h3>书单</h3>
            <table className="tbl compact">
              <tbody>
                {BOOKS.map((r) => (<tr key={r[0]}><td className="name" style={{ width: 190 }}>{r[0]}</td><td className="muted">{r[1]}</td></tr>))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h3>文章 / 长文教程</h3>
            <table className="tbl compact">
              <tbody>
                {ARTICLES.map((r) => (
                  <tr key={r[0]}>
                    <td className="name"><a className="news-title" href={r[1]} target="_blank" rel="noreferrer">{r[0]} →</a></td>
                    <td className="muted">{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint">先读方法论再上实盘；任何"带单/收费群"都是收割，超短盈利靠自己的纪律和复盘闭环。</div>
          </div>
        </div>
      )}
    </div>
  );
}
