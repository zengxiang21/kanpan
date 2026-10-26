// 超短知识库：情绪周期 / 竞价战法 / 买点三式 / 卖点纪律 / 术语表（静态内置，可迭代）
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
  ['打板', '涨幅触及涨停价 + 封单快速增加 + 板块联动（同板块 ≥3 只涨停）', '排单在涨停价；封单/流通市值 <2% 的烂板不排'],
  ['半路', '站上分时均价线 + 放量突破 10:00 前平台高点', '半路仓位 < 打板仓位；突破失败立即走'],
  ['低吸', '强势股缩量回踩分时均价线 / 5日线 / 昨日涨停价，企稳不创分时新低', '挂单在支撑位下方 0.5%；破位止损'],
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
  ['晋级率', '昨日 N 板今日 N+1 板的比例，情绪接力强度'],
];

export default function KnowledgePage() {
  return (
    <div className="page">
      <h2 className="page-title">超短知识库</h2>
      <div className="hint" style={{ marginBottom: 12 }}>每个战法都对应系统里的功能页：竞价战法→竞价雷达，低吸→形态选股-缩量回踩，回流→龙头回流。</div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>情绪周期六阶段（先看环境再出手）</h3>
        <table className="tbl compact">
          <thead><tr><th>阶段</th><th>识别信号</th><th>打法</th><th>最大风险</th></tr></thead>
          <tbody>
            {CYCLE.map((r) => (
              <tr key={r.stage}>
                <td className="name">{r.stage}</td>
                <td>{r.sign}</td>
                <td>{r.play}</td>
                <td className="muted">{r.risk}</td>
              </tr>
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
              {AUCTION.map((r) => (
                <tr key={r[0]}><td className="name">{r[0]}</td><td>{r[1]}</td><td className="muted">{r[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>买点三式</h3>
          <table className="tbl compact">
            <thead><tr><th>买点</th><th>确认条件</th><th>执行</th></tr></thead>
            <tbody>
              {BUYS.map((r) => (
                <tr key={r[0]}><td className="name">{r[0]}</td><td>{r[1]}</td><td className="muted">{r[2]}</td></tr>
              ))}
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
              {SELLS.map((r) => (
                <tr key={r[0]}><td className="name">{r[0]}</td><td>{r[1]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>术语表</h3>
          <table className="tbl compact">
            <tbody>
              {TERMS.map((r) => (
                <tr key={r[0]}><td className="name" style={{ width: 90 }}>{r[0]}</td><td className="muted">{r[1]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
