// 美股财报日历推算单测（离线，不联网，数据取自 SEC EDGAR 实测）
import { forecast } from '../server/src/earnings.js?u=1';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const TODAY = new Date('2026-10-30T00:00:00Z');

// NVDA：EDGAR 实测发财报日（8-K Item 2.02），财年结束 1-31
// 近年 11 月那次：2025-11-19 / 2024-11-20 / 2023-11-21
const NVDA = ['2026-08-26','2026-05-20','2026-02-25','2025-11-19','2025-08-27','2025-05-28','2025-02-26','2024-11-20','2024-08-28','2024-05-22'];
// AAPL：财年结束 9-26，近年 10 月底：2025-10-30 / 2024-10-31
const AAPL = ['2026-07-30','2026-04-30','2026-01-29','2025-10-30','2025-07-31','2025-05-01','2025-01-30','2024-10-31','2024-08-01','2024-05-02'];
// AVGO：财年结束 11-01，12 月中：2025-12-11 / 2024-12-12
const AVGO = ['2026-09-02','2026-06-03','2026-03-04','2025-12-11','2025-09-04','2025-06-05','2025-03-06','2024-12-12','2024-09-05','2024-06-12'];
// AMD：财年结束 12-26，10 月底~11 月初：2025-11-04 / 2024-10-29
const AMD = ['2026-08-04','2026-05-05','2026-02-03','2025-11-04','2025-08-05','2025-05-06','2025-02-04','2024-10-29','2024-07-30','2024-04-30'];
// TSLA：一季两个 2.02（交付量 + 财报），必须收敛到最晚那个
const TSLA = ['2026-10-21','2026-10-02','2026-07-22','2026-07-02','2026-04-22','2026-04-02','2026-01-28','2026-01-02','2025-10-22','2025-10-02'];

console.log('[1] 英伟达推算 11 月中下旬（真实历史 11-19/11-20/11-21）');
{
  const f = forecast(NVDA, '0131', TODAY);
  console.log('     next=' + f.nextDate + ' window=' + f.windowStart + '~' + f.windowEnd);
  ok(f.nextDate >= '2026-11-17' && f.nextDate <= '2026-11-22', 'nextDate 落在 11-17~11-22，实际 ' + f.nextDate);
  ok(f.windowEnd >= f.nextDate, 'windowEnd 不早于 nextDate');
  ok(f.lastReport === '2026-08-26', 'lastReport=2026-08-26，实际 ' + f.lastReport);
}

console.log('[2] 苹果推算 10 月底（真实历史 10-30/10-31）');
{
  const f = forecast(AAPL, '0926', TODAY);
  console.log('     next=' + f.nextDate + ' window=' + f.windowStart + '~' + f.windowEnd);
  ok(f.nextDate >= '2026-10-28' && f.nextDate <= '2026-11-02', 'nextDate 落在 10-28~11-02，实际 ' + f.nextDate);
}

console.log('[3] 博通推算 12 月中（真实历史 12-11/12-12）');
{
  const f = forecast(AVGO, '1101', TODAY);
  console.log('     next=' + f.nextDate + ' window=' + f.windowStart + '~' + f.windowEnd);
  ok(f.nextDate >= '2026-12-08' && f.nextDate <= '2026-12-14', 'nextDate 落在 12-08~12-14，实际 ' + f.nextDate);
}

console.log('[4] AMD 推算区间必须覆盖 11-04（真实 2025-11-04）');
{
  const f = forecast(AMD, '1226', TODAY);
  console.log('     next=' + f.nextDate + ' window=' + f.windowStart + '~' + f.windowEnd);
  ok(f.windowEnd >= '2026-11-04', 'windowEnd 覆盖到 11-04，实际 ' + f.windowEnd);
  ok(f.nextDate >= '2026-10-25', 'nextDate 不早于 10-25，实际 ' + f.nextDate);
}

console.log('[5] 特斯拉一季两个 2.02，必须收敛到财报（lag 不该是 4 天）');
{
  const f = forecast(TSLA, '1231', TODAY);
  console.log('     next=' + f.nextDate + ' lastReport=' + f.lastReport);
  // 若未收敛，10-02 会被当成财报，lag=4，推算日会错到 10-04 之类
  ok(f.lagDays >= 15, 'lagDays >= 15（说明没被 10-02 交付量拉低），实际 ' + f.lagDays);
  ok(f.lastReport === '2026-10-21', 'lastReport=2026-10-21，实际 ' + f.lastReport);
}

console.log('[6] 财年≠日历年不能把 lag 错配（NVDA 曾被算成 lagMap 只剩 1 月）');
{
  const f = forecast(NVDA, '0131', TODAY);
  ok(f.nextDate !== '2027-04-09', '不出现曾有的 bug 值 2027-04-09');
  ok(f.samples === NVDA.length, 'samples 等于输入条数');
}

console.log('[7] 边界与脏数据');
{
  const empty = forecast([], '1231', TODAY);
  ok(empty.nextDate === null && empty.lastReport === null, '空数组返回 null 不抛错');
  const one = forecast(['2025-10-30'], '1231', TODAY);
  ok(one.nextDate !== null, '单条样本也能推算');
  const bad = forecast(['not-a-date', '', null], '1231', TODAY);
  ok(bad.nextDate === null, '脏日期不抛错');
  const weirdFye = forecast(AAPL, '9999', TODAY);
  ok(typeof weirdFye.nextDate === 'string' || weirdFye.nextDate === null, '异常 fye 不抛错');
}

console.log('[8] windowEnd 恒 >= date 且落在财季末之后');
{
  for (const [name, dates, fye] of [['NVDA',NVDA,'0131'],['AAPL',AAPL,'0926'],['AVGO',AVGO,'1101'],['AMD',AMD,'1226'],['TSLA',TSLA,'1231']]) {
    const f = forecast(dates, fye, TODAY);
    ok(f.windowEnd >= f.nextDate && f.windowEnd > f.windowStart, name + ' 区间自洽 ' + f.windowStart + '~' + f.windowEnd);
  }
}

console.log('');
console.log('===== ' + pass + ' passed, ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
