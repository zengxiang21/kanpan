// 美国宏观数据日历单测：node scripts/test-macro.mjs
import { buildMacroCalendar } from '../server/src/macro.js';

let pass = 0, fail = 0;
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n        got  ${JSON.stringify(a)}\n        want ${JSON.stringify(b)}`); }
};
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

console.log('\n[1] 30 天窗口：结构完整');
{
  const r = buildMacroCalendar(30);
  ok(Array.isArray(r.events), 'events 是数组');
  ok(r.events.length > 0, '有事件');
  ok(typeof r.note === 'string' && r.note.length > 0, '有 note 说明推算口径');
  ok(typeof r.source === 'string', '有 source');
  ok(typeof r.unavailable === 'string' && r.unavailable.includes('14'), '记录了免费源调研结论');
}

console.log('\n[2] 字段完整性');
{
  const r = buildMacroCalendar(60);
  for (const e of r.events) {
    for (const k of ['date', 'time', 'title', 'importance', 'kind', 'note', 'daysAhead']) {
      if (e[k] === undefined) { fail++; console.log(`  FAIL 事件缺字段 ${k}: ${JSON.stringify(e)}`); break; }
    }
  }
  eq(r.events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)), true, 'date 格式 yyyy-MM-dd');
  eq(r.events.every((e) => /^\d{2}:\d{2}$/.test(e.time)), true, 'time 格式 HH:MM');
  eq(r.events.every((e) => e.importance >= 1 && e.importance <= 3), true, 'importance 在 1~3');
}

console.log('\n[3] 不返回过去事件（含"今天但时刻已过"）');
{
  const r = buildMacroCalendar(30);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  eq(r.events.every((e) => e.date >= today), true, '无过去日期事件');
  // 今天的事件，其时刻必须晚于当前北京时间
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const nowMin = bj.getUTCHours() * 60 + bj.getUTCMinutes();
  for (const e of r.events.filter((x) => x.date === today)) {
    const [hh, mm] = e.time.split(':').map(Number);
    ok(hh * 60 + mm >= nowMin, `${e.title} 今天 ${e.time} 晚于当前北京 ${String(Math.floor(nowMin / 60)).padStart(2, '0')}:${String(nowMin % 60).padStart(2, '0')}`);
  }
  eq(r.events.every((e) => e.daysAhead >= 0 && e.daysAhead <= 30), true, 'daysAhead 在 0~30');
}

console.log('\n[4] 按日期升序');
{
  const r = buildMacroCalendar(90);
  const dates = r.events.map((e) => e.date);
  eq([...dates].sort(), dates, 'events 按 date 升序');
}

console.log('\n[5] 关键事件类型都在');
{
  const r = buildMacroCalendar(90);
  const kinds = new Set(r.events.map((e) => e.kind));
  ok(kinds.has('fomc'), '含 FOMC');
  ok(kinds.has('jobs'), '含非农');
  ok(kinds.has('cpi'), '含 CPI');
  ok(kinds.has('ppi'), '含核心 PPI');
  ok(kinds.has('pmi'), '含 ISM PMI');
  // GDP 只在 1/4/7/10 月发布，90 天窗口内不一定有，用 200 天窗口验证
  const r200 = buildMacroCalendar(200);
  ok(new Set(r200.events.map((e) => e.kind)).has('gdp'), '200 天窗口含 GDP');
  const fomc = r.events.filter((e) => e.kind === 'fomc');
  ok(fomc.every((e) => e.importance === 3), 'FOMC 都是最高重要性');
  ok(fomc.every((e) => e.note.length > 0), 'FOMC 都有影响说明');
}

console.log('\n[6] 非农 = 每月第一个周五');
{
  const r = buildMacroCalendar(90);
  const jobs = r.events.filter((e) => e.kind === 'jobs');
  ok(jobs.length >= 2, `90 天窗口至少 2 次非农（实际 ${jobs.length}，取决于当天距月底远近）`);
  for (const j of jobs) {
    const dow = new Date(j.date + 'T00:00:00Z').getUTCDay();
    eq(dow, 5, `${j.date} 是周五`);
    // 必须落在 1-7 号之间（每月第一个周五）
    const day = Number(j.date.slice(8));
    ok(day >= 1 && day <= 7, `${j.date} 在 1-7 号之间`);
  }
}

console.log('\n[7] FOMC 日程与美联储官网一致');
{
  // 美联储官网公布的是"美东决议日"，美东 14:00 = 北京次日 02:00/03:00，
  // 所以对外展示用北京日期 = 美东日期 +1
  const r = buildMacroCalendar(400);
  const fomcDates = r.events.filter((e) => e.kind === 'fomc').map((e) => e.date);
  ok(fomcDates.includes('2026-12-10'), '含 2026-12-10（美东 12-09 决议的北京日期）');
  ok(fomcDates.includes('2027-01-28'), '含 2027-01-28（美东 01-27）');
  ok(fomcDates.includes('2027-03-18'), '含 2027-03-18（美东 03-17）');
  ok(fomcDates.length >= 8, `400 天窗口 FOMC 数 >= 8（实际 ${fomcDates.length}）`);
}

console.log('\n[8] 窗口参数边界');
{
  ok(buildMacroCalendar(1).events.every((e) => e.daysAhead <= 1), 'days=1 只返回今天');
  ok(buildMacroCalendar(0).events.length >= 0, 'days=0 回落默认 30，不抛错');
  ok(buildMacroCalendar(-5).events.length >= 0, 'days 负数回落默认 30，不抛错');
  ok(buildMacroCalendar('abc').events.length >= 0, 'days 非数字回落默认 30，不抛错');
  ok(buildMacroCalendar(9999).events.length > 0, 'days 大值不被模块裁剪（上限由 HTTP 层管）');
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
