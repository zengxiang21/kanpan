// 超短知识库：战法速查 / 视频课 / 实战案例 / 游资妖股复盘 / 心法语录 / 书单文章
import { useState } from 'react';

const TABS = [
  { key: 'quick', label: '战法速查' },
  { key: 'video', label: '视频课' },
  { key: 'cases', label: '实战案例' },
  { key: 'hotmoney', label: '游资妖股复盘' },
  { key: 'quotes', label: '心法语录' },
  { key: 'discipline', label: '交易纪律' },
  { key: 'books', label: '书单文章' },
  { key: 'read', label: '阅读中' },
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
  { cat: '竞价', title: '集合竞价最强公式打板战法（保姆级）', bv: 'BV18CPcz2E5z', desc: '竞价量化打板战法，含选股公式思路' },
  { cat: '竞价', title: '通达信集合竞价打板技巧实战', bv: 'BV1k92RYEEuk', desc: '竞价实战教程详解' },
  { cat: '打板', title: '集合竞价就能打板：锁定能连板的强势股', bv: 'BV13i8jzZEqA', desc: '竞价选强势股的实战手法' },
  { cat: '打板', title: 'A股集合竞价六大要素', bv: 'BV1tx4y1N7fQ', desc: '竞价必懂的六个要素，配合竞价雷达验证' },
];

// ---------- 游资风格库（均为公开流传的风格画像，席位常变不列具体席位） ----------
const HOTMONEY = [
  { name: '赵老哥', style: '八年一万倍', core: '打板接力 · 二板定龙头', detail: '标志性打法是"首板看得清、二板辨强弱"：只在确定性的板块龙头上做接力，二板竞价或开盘抢筹，高度板的持有靠情绪周期而不是信仰。仓位重、出手少，弱市空仓极快。', env: '发酵期/主升期最强，退潮期几乎消失' },
  { name: '章盟主', style: '大资金龙头主升', core: '权重级龙头 · 主升浪持有', detail: '资金体量大，偏好有容量的大票主升浪（大科技/大题材总龙头），很少做纯情绪小票。买点偏趋势确认后的右侧，持有周期比一般游资长。', env: '指数配合的结构性行情' },
  { name: '炒股养家', style: '情绪周期理论集大成', core: '市场合力 · 强者恒强', detail: '养家心法核心：股价由市场合力决定，情绪高涨时"看错也要做"，退潮时"看对也不做"。重逻辑+重情绪面，动作少而坚决，是几乎所有情绪周期玩家的理论源头。', env: '全周期，核心是识别周期位置' },
  { name: '作手新一', style: '连板加速', core: '高度板 · 情绪冰点首板', detail: '擅长在情绪冰点后捕捉新周期首板、在主流题材加速段做高度板接力。对"空间板"的信仰管理严格：断板即走。', env: '启动期首板、高潮期加速' },
  { name: '北京炒家', style: '首板收割机', core: '批量首板 · 隔日溢价', detail: '以量大面广的首板打板著称：在情绪回暖日批量打主流首板，吃次日溢价，不恋战。对涨停时间要求高（越早越强），尾盘板基本不打。', env: '情绪修复日/主升期' },
];

// ---------- 经典妖股复盘（公开报道整理，数字为约值，以行情软件为准） ----------
const FAMOUS = [
  {
    title: '东方通信 · 2018.11-2019.03（10倍 · 完整情绪周期教科书）',
    tag: '正面教材 · 情绪周期全样本',
    bg: '5G 概念元年+科创板预期，公司多次公告"与 5G 无关"仍被资金爆炒——纯粹的情绪驱动样本。首板 2018-11-26，从约 3.7 元到 2019-03-05 高点约 41.88 元（约 +1032%），期间 29~31 次涨停，2019-03-08 跌停告终（公开报道口径）。',
    stages: [
      ['启动（11月末）', '5G 消息催化，首板无量、无人注意；第二、三板开始放量，"识货"资金进场'],
      ['发酵（12月）', '11天10板成为空间板，媒体开始报道"伪5G"争议——争议=辨识度，游资接力加速'],
      ['高潮（2019年1-2月）', '每次回调都被接起（断板→回流→再板），成为全市场情绪风向标：它不死，题材不灭'],
      ['分歧→崩塌（3月初）', '2-26 尾盘半小时从涨停砸到 -9%（振幅19%）是第一次大分歧警告；3-8 跌停=周期结束，之后一路阴跌再无二波'],
    ],
    learn: ['空间板的"风向标属性"：它断板那天，全市场短线都要收缩', '争议和利空公告打不死真龙头（利空=换手=接力机会）', '高潮期最后一次"假回流"最容易套人——大分歧日（尾盘炸板潮）后不再接'],
    risk: '把妖股信仰化拿到最后：3-8 跌停后连续阴跌，没有像样二波',
  },
  {
    title: '中通客车 · 2022.05-07（+391% · 监管与减持的反面教材）',
    tag: '反面教材 · 退潮地狱',
    bg: '核酸检测车概念+游资接力：2022-05-13 起连续涨停，11 个交易日 +186%，至 6-21 累计 +391%；期间 6 次异动公告、2 次停牌核查。',
    stages: [
      ['5月中', '十连板震惊全市场，概念当时存疑（基本面：上半年客车销量同比 -17%）'],
      ['6月', '第一次停牌核查后复牌继续涨——"核查不死"反而强化了妖股信仰（危险信号！）'],
      ['7月中旬', '第二次停牌核查 + 二股东山东国投减持 592.9 万股（1%）+ 私募提前埋伏盘兑现'],
      ['7-21', '一字跌停，跌停封单近 20 亿、成交仅 2 亿——想跑跑不掉，跟风者全部闷杀'],
    ],
    learn: ['两度停牌核查不死≠安全，是监管耐心耗尽的前兆', '大股东/私募减持公告=筹码供给信号，比任何技术面都真实', '一字跌停的流动性地狱：妖股末期的仓位要按"卖不出"来管理'],
    risk: '在"核查不死"的信仰里加仓——这是妖股末期最贵的学费',
  },
  {
    title: '九安医疗 · 2021.11-2022.01（消息持续催化的波段妖股）',
    tag: '正面教材 · 消息接力型',
    bg: '美国抗原检测大订单持续公告催化：每间隔数日一份订单/合作公告，股价从约 5 元区间起步，2022-01 最高触及 88 元附近（约 14 倍，约值）。',
    stages: [
      ['11月中', '首单公告首板——与东方通信"纯情绪"不同，这里有真实业绩落地的逻辑锚'],
      ['12月', '每隔数日一份新订单公告：每次回调都有"新催化"接住——消息接力=回调即买点'],
      ['2022年1月', '涨至 88 元附近后订单边际放缓，高位巨震，波段结束'],
    ],
    learn: ['"催化密度"决定妖股生命长度：持续新消息=回调皆可接；催化断档=立即走', '有业绩逻辑锚的妖股比纯情绪妖股活得久、二波也更真实', '公告节奏本身就是情绪周期的量化信号'],
    risk: '把"逻辑真"当成"永远涨"：催化边际放缓时它跌起来和纯情绪票一样狠',
  },
];

// ---------- 心法语录（网络流传整理，出处归属以流传版本为准） ----------
const QUOTES = [
  ['炒股养家', '股价上涨的根本动力是市场合力；看清合力的方向，比看清任何一只票都重要。'],
  ['炒股养家', '强势市场做强势股，弱势市场做超跌股，震荡市场做题材轮动——环境错了，全错。'],
  ['炒股养家', '别人恐慌时贪婪的前提，是你确定自己是少数先知先觉者；大多数人的逆势抄底只是接飞刀。'],
  ['赵老哥', '首板看得清，二板辨强弱——接力只做龙头，跟风板是陷阱。'],
  ['赵老哥', '行情好多做，行情不好多休息；选对方向比努力重要。'],
  ['作手新一', '空间板的使命是打开高度，它的死活就是全市场的情绪开关。'],
  ['北京炒家', '只打上午的板，尾板的溢价是玄学；打板打的是时间，越早越强。'],
  ['通用纪律', '打板炸板无条件走；连亏两笔当日停手；妖股仓位按"卖不出"管理。'],
];

// ---------- 实战案例（时间轴拆解） ----------
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
    mistakes: ['早盘回落时恐慌卖在均价线下方 2%', '二连板后贪心加仓（超计划仓位）', '第三日幻想"还能反包"错过竞价离场点'],
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
    keys: ['弱转强三要素：昨日分歧 + 今日高开 2% 以上 + 竞价带量', '9:20 前的竞价数据会骗人', '分歧期买点质量 > 发酵期追高', '未封板的冲高先落袋一半'],
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
const DISCIPLINE = [
  ['仓位纪律', '单票不超 3 成；总仓位按环境评分：≥75 用 8 成、50-75 用 5 成、30-50 用 2 成、<30 空仓', '连板股只做一个，不并存两个高位票'],
  ['止损纪律', '打板票：炸板回封失败无条件走；半路票：破分时均价线走；低吸票：破预设支撑（MA5/昨涨停价）走', '所有票硬止损 -3%，不等反弹'],
  ['连亏纪律', '连亏 2 笔当日停手复盘；连亏 3 笔休息一天，只看不做', '复盘必写错误原因：是环境错、选股错还是执行错'],
  ['妖股末期纪律', '高位妖股仓位按"卖不出"管理；两度停牌核查的票直接拉黑；大股东减持公告=清仓信号', '参考中通客车案例：一字跌停 20 亿封单出逃无门'],
  ['利润兑现纪律', '浮盈 >10% 至少兑现一半让利润奔跑；竞价高开不及预期（<1%）竞价就走', '卖飞不可耻，坐过山车才可惜'],
  ['复盘纪律', '每天收盘后必写三行：今日主线/明日预案/今日错误；每周日统计胜率与盈亏比', '没有复盘的超短=赌博'],
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

const HM_REFS = [
  ['赵老哥 · 八年一万倍语录与复盘合集（B站/知乎搜索）', 'https://search.bilibili.com/all?keyword=%E8%B5%B5%E8%80%81%E5%93%A5%20%E5%A4%8D%E7%9B%98'],
  ['章盟主 · 大资金龙头主升手法（搜索）', 'https://search.bilibili.com/all?keyword=%E7%AB%A0%E7%9B%9F%E4%B8%BB%20%E9%BE%99%E5%A4%B4'],
  ['炒股养家心法完整版（雪球/知乎搜索）', 'https://xueqiu.com/k?q=%E7%82%92%E8%82%A1%E5%85%BB%E5%AE%B6%E5%BF%83%E6%B3%95'],
  ['作手新一 · 连板加速打法（搜索）', 'https://search.bilibili.com/all?keyword=%E4%BD%9C%E6%89%8B%E6%96%B0%E4%B8%80'],
  ['北京炒家 · 首板打法（搜索）', 'https://search.bilibili.com/all?keyword=%E5%8C%97%E4%BA%AC%E7%82%92%E5%AE%B6%20%E9%A6%96%E6%9D%BF'],
];
const BOOKS = [
  ['股票大作手回忆录', '利弗莫尔趋势与关键点思想，所有超短体系的源头'],
  ['十年一梦（青泽）', '国内期货操盘手的实战心路，仓位与纪律的教科书'],
  ['缠中说禅·教你炒股票 108 课', '区间套/背驰/级别，技术分析的底层框架'],
  ['短线交易大师（奥德里奇）', '日内交易的进出场纪律'],
];
const ARTICLES = [
  ['短线王牌：情绪流龙头战法与打板（雪球长文）', 'https://xueqiu.com/1899529380/306482390', '涵盖龙头、补涨、切换、情绪周期核心内容'],
  ['情绪龙头战法：情绪周期的思考与操作节点（雪球）', 'https://xueqiu.com/k?q=%E6%83%85%E7%BB%AA%E5%91%A8%E6%9C%9F%20%E6%93%8D%E4%BD%9C%E8%8A%82%E7%82%B9', '周期阶段与节点操作'],
  ['长文 342279758（雪球 · 用户推荐）', 'https://xueqiu.com/1899529380/342279758', '实战长文 · 支持站内阅读'],
  ['龙头战法与空间板（知乎搜索）', 'https://www.zhihu.com/search?type=content&q=%E7%A9%BA%E9%97%B4%E6%9D%BF%20%E9%BE%99%E5%A4%B4%E6%88%98%E6%B3%95', '空间板与情绪风向标'],
  ['弱转强实战拆解（知乎搜索）', 'https://www.zhihu.com/search?type=content&q=%E5%BC%B1%E8%BD%AC%E5%BC%BA%20%E7%AB%9E%E4%BB%B7', '分歧转一致的买点案例'],
  ['断板回流与二波（知乎搜索）', 'https://www.zhihu.com/search?type=content&q=%E6%96%AD%E6%9D%BF%20%E5%9B%9E%E6%B5%81%20%E4%BA%8C%E6%B3%A2', '回流战法案例'],
  ['超短仓位管理与止损纪律（知乎搜索）', 'https://www.zhihu.com/search?type=content&q=%E8%B6%85%E7%9F%AD%E7%BA%BF%20%E4%BB%93%E4%BD%8D%20%E6%AD%A2%E6%8D%9F', '纪律体系'],
  ['情绪龙头战法——情绪周期的思考与操作节点（豆瓣）', 'https://m.douban.com/note/856515374', '周期阶段与操作节点的对应关系'],
  ['情绪周期才是龙头战法的根基（网易视频）', 'https://www.163.com/v/video/VF6NTE89A.html', '视频讲解'],
];

export default function KnowledgePage() {
  const [tab, setTab] = useState('quick');
  const [video, setVideo] = useState(null);
  const [readUrl, setReadUrl] = useState(null);
  const [readText, setReadText] = useState('');
  const [readErr, setReadErr] = useState(null);
  const openRead = (url) => {
    setReadUrl(url); setReadText(''); setReadErr(null); setTab('read');
    fetch('/api/article?url=' + encodeURIComponent(url)).then((r) => r.text()).then((t) => {
      if (t.startsWith('{')) { setReadErr('抓取失败（部分站点反爬），请点原链接阅读'); setReadText(''); }
      else {
        const clean = t.split('<script').join('<div').split('</script>').join('</div>').split('<style').join('<div').split('</style>').join('</div>');
        const plain = clean.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, 20000);
        setReadText(plain);
      }
    }).catch((e) => setReadErr(e.message));
  };
  const [caseOpen, setCaseOpen] = useState(0);
  const [hmOpen, setHmOpen] = useState(0);

  return (
    <div className="page">
      <h2 className="page-title">
        超短知识库
        <span className="page-tag">内容仅供学习，不构成投资建议；案例为公开报道整理，数字为约值；视频为第三方 UP 主内容</span>
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
          {CASES.map((c, ci) => (
            <div className="panel" style={{ marginBottom: 12 }} key={c.title}>
              <h3 style={{ cursor: 'pointer' }} onClick={() => setCaseOpen(caseOpen === ci ? -1 : ci)}>
                {caseOpen === ci ? '▼ ' : '▶ '}{c.title}
              </h3>
              {caseOpen === ci && (
                <>
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
                </>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'hotmoney' && (
        <>
          <div className="panel" style={{ marginBottom: 12 }}>
            <h3>游资风格库（公开流传画像 · 席位常变不列具体席位）</h3>
            {HOTMONEY.map((h, i) => (
              <div className="panel" style={{ background: 'var(--panel2)', marginBottom: 8 }} key={h.name}>
                <div className="plan-head">
                  <b style={{ fontSize: 15 }}>{h.name}</b>
                  <span className="lb lb-high">{h.style}</span>
                  <span className="plan-mode">{h.core}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>{h.detail}</div>
                <div className="hint">适用环境：{h.env}</div>
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginBottom: 12 }}>
            <h3>经典妖股复盘（公开报道整理 · 教学用途，数字为约值）</h3>
            {FAMOUS.map((c, ci) => (
              <div style={{ marginBottom: 14 }} key={c.title}>
                <div className="plan-head">
                  <b>{c.title}</b>
                  <span className={`lb ${c.tag.includes('反面') ? 'lb-green' : 'lb-high'}`}>{c.tag}</span>
                </div>
                <div className="plan-note">{c.bg}</div>
                <table className="tbl compact">
                  <thead><tr><th style={{ width: 120 }}>阶段</th><th>盘面特征</th></tr></thead>
                  <tbody>
                    {c.stages.map((r, i) => (<tr key={i}><td className="name">{r[0]}</td><td className="case-plain">{r[1]}</td></tr>))}
                  </tbody>
                </table>
                <div className="case-keys">
                  <div><b className="up">可学点：</b>{c.learn.join('；')}</div>
                  <div><b className="down">风险：</b>{c.risk}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'quotes' && (
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

      {tab === 'discipline' && (
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

      {tab === 'hotmoney' && (
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

      {tab === 'read' && (
        <div className="panel">
          <h3>站内阅读 {readUrl ? <a className="news-title" href={readUrl} target="_blank" rel="noreferrer">原链接 →</a> : ''}</h3>
          {readErr ? <div className="hint warm-hint">抓取失败：{readErr}（可点原链接）</div> : readText ? (
            <pre className="case-plain" style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}>{readText}</pre>
          ) : <div className="empty">加载中…</div>}
        </div>
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
                    <td><button className="mini" onClick={() => openRead(r[1])}>站内阅读</button></td>
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
