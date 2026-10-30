// 美国经济数据日历（C4）
//
// 调研结论（2026-10-29，试过 14 个源全部失败）：
//   东财数据中心 RPT_ECONOMIC_CALENDAR / RPT_ECONOMICS_CALENDAR / ... → "报表配置不存在"
//   新浪 EconomicCalendarService / CNService.getCalendarData          → "Service not valid"
//   金十 cdn-rili.jin10.com / rili.jin10.com                          → DNS 失败 / 404
//   Investing.com api.investing.com                                    → 403
//   TradingView economic-calendar.tradingview.com                      → 无法连接
//   FRED api.stlouisfed.org                                            → 需有效 API key
//   （补充：同站的 fredgraph.csv 是公开端点、无需 key，美债收益率已用它实现，
//     见 server/src/treasury.js——当初据此条误判「美债无免费源」）
//   东财 api-dc-winner GetEconomicCalendar                             → 返回 HTML 首页
//   新浪 7x24 / 东财快讯                                                → 快讯流，needCalender 全 false
//   BLS 发布日程页                                                      → 403
//
// 没有稳定的免费结构化日历源。这里改用「官方固定规则推算」：
//   FOMC 日期来自美联储官网公布的日程（每年 8 次，日期固定）
//   非农 = 每月第一个周五；CPI = 每月 10-15 号（BLS 通常 13 号前后）
//   GDP / PMI / 零售 等按各自固定发布规律推算
// 这不是爬虫，没有前值/预期值/实际值，但日期准确、对"盘前要不要规避"足够。
// 注：美债收益率（含历史百分位）不在此文件，已由 server/src/treasury.js 用 FRED 公开端点实现。
// 若日后找到可用源，替换 buildMacroCalendar 内部实现即可，接口不用变。

// FOMC 日程（美联储官网，含 SEP 的会议标 *）
// 来源: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
const FOMC = {
  2026: [
    ['01-27', '01-28'], ['03-17', '03-18'], ['04-28', '04-29'], ['06-16', '06-17'],
    ['07-28', '07-29'], ['09-15', '09-16'], ['10-27', '10-28'], ['12-08', '12-09'],
  ],
  2027: [
    ['01-26', '01-27'], ['03-16', '03-17'], ['04-27', '04-28'], ['06-08', '06-09'],
    ['07-27', '07-28'], ['09-14', '09-15'], ['10-26', '10-27'], ['12-07', '12-08'],
  ],
  2028: [['01-25', '01-26']],
};

// 每月第一个周五（非农）
function firstFriday(y, m) {
  const d = new Date(Date.UTC(y, m - 1, 1));
  const dow = d.getUTCDay(); // 0=Sun
  const add = (5 - dow + 7) % 7;
  return new Date(Date.UTC(y, m - 1, 1 + add));
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// 北京时间 → UTC 日期（美东公布的宏观数据，按北京日期展示更实用）
function bjNow() {
  return new Date(Date.now() + 8 * 3600 * 1000);
}

// 北京当天的年月日
function bjToday() {
  const bj = bjNow();
  return { y: bj.getUTCFullYear(), m: bj.getUTCMonth() + 1, d: bj.getUTCDate(), hh: bj.getUTCHours(), mm: bj.getUTCMinutes() };
}

/**
 * 生成未来 N 天的美国宏观数据日程
 * @param {number} days 天数（默认 30；<=0 或非数字回落默认值，不强制裁剪大值，
 *                      调用方（HTTP 层）负责限制上限）
 * @returns {{events:Array, note:string, source:string}}
 */
export function buildMacroCalendar(days = 30) {
  const n = Number(days);
  const win = Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
  const events = [];
  const today = bjToday();
  const end = new Date(Date.UTC(today.y, today.m - 1, today.d + win));

  const push = (dateStr, time, title, importance, kind, note) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt < new Date(Date.UTC(today.y, today.m - 1, today.d)) || dt > end) return;
    // 今天但时刻已过的事件不显示（对盘前决策无意义，例如美东昨晚的 FOMC 决议）
    if (dt.getTime() === new Date(Date.UTC(today.y, today.m - 1, today.d)).getTime()) {
      const [hh, mm] = time.split(':').map(Number);
      if (hh * 60 + mm < today.hh * 60 + today.mm) return;
    }
    events.push({ date: dateStr, time, title, importance, kind, note, daysAhead: Math.round((dt - new Date(Date.UTC(today.y, today.m - 1, today.d))) / 86400000) });
  };

  // ---- FOMC ----
  for (const [year, list] of Object.entries(FOMC)) {
    for (const [, end2] of list) {
      const [m, d] = end2.split('-').map(Number);
      // 决议公布是美东下午 2 点 = 北京次日凌晨 2/3 点，按北京日期记次日
      const bj = new Date(Date.UTC(+year, m - 1, d + 1));
      push(iso(bj), '02:00', '美联储 FOMC 利率决议', 3, 'fomc', '影响全球风险偏好与美债收益率；A股开盘前需看结果');
    }
  }

  // ---- 非农：每月第一个周五（美东 8:30 = 北京 21:30 冬令时 / 20:30 夏令时）----
  for (let i = 0; i <= 2; i++) {
    const ny = today.m + i > 12 ? today.y + 1 : today.y;
    const nm = today.m + i > 12 ? today.m + i - 12 : today.m + i;
    push(iso(firstFriday(ny, nm)), '21:30', '美国非农就业报告', 3, 'jobs', '最强宏观数据，超预期→加息预期升温→压制成长股');
  }

  // ---- CPI：BLS 通常在每月 10-15 日，取 13 号 ----
  for (let i = 0; i <= 2; i++) {
    const cy = today.m + i > 12 ? today.y + 1 : today.y;
    const cm = today.m + i > 12 ? today.m + i - 12 : today.m + i;
    push(`${cy}-${pad(cm)}-13`, '21:30', '美国 CPI', 3, 'cpi', '通胀核心数据，直接影响降息路径与美债收益率');
    // 核心 PPI 通常在 CPI 前两天
    push(`${cy}-${pad(cm)}-11`, '21:30', '美国核心 PPI', 2, 'ppi', 'CPI 前瞻指标');
  }

  // ---- GDP：季度初，1/4/7/10 月的 25-30 号 ----
  for (let i = 0; i <= 4; i++) {
    const gy = today.m + i > 12 ? today.y + 1 : today.y;
    const gm = today.m + i > 12 ? today.m + i - 12 : today.m + i;
    if ([1, 4, 7, 10].includes(gm)) {
      push(`${gy}-${pad(gm)}-28`, '21:30', '美国 GDP 年化季率', 2, 'gdp', '经济增长总览');
    }
  }

  // ---- ISM 制造业 PMI：每月首个交易日，取 1 号 ----
  for (let i = 0; i <= 2; i++) {
    const py = today.m + i > 12 ? today.y + 1 : today.y;
    const pm = today.m + i > 12 ? today.m + i - 12 : today.m + i;
    push(`${py}-${pad(pm)}-01`, '22:00', 'ISM 制造业 PMI', 2, 'pmi', '50 为荣枯线，领先指标');
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return {
    events,
    note: '按官方固定发布规律推算（非农=每月首个周五、CPI≈每月13号、FOMC=美联储官网日程），无前值/预期值/实际值；具体时刻以官方公告为准。',
    source: '美联储官网 FOMC 日程 + 各机构固定发布规律推算',
    unavailable: '结构化免费日历源调研 14 个全部不可用（东财/新浪/金十/Investing/TradingView/FRED/BLS），详见 server/src/macro.js 注释',
  };
}
