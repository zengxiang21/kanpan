// 外盘期货解析单测（离线）
//
// 数据源：新浪 hq.sinajs.cn 的 hf_ 前缀期货（hf_NQ/hf_ES/hf_YM/hf_CHA50CFD）。
// 字段格式（与实测一致）：
//   f[0]=现价 f[4]=最高 f[5]=最低 f[6]=行情时间 f[7]=昨收(涨跌基准)
//   f[8]=昨结 f[12]=日期 f[13]=中文名称
// 这些期货近乎 23.5 小时连续交易，A股开盘时它已综合隔夜美股+亚盘情绪，
// 是比美股现货收盘价更实用的盘前风向标。
//
// parseFuture 未导出，这里用同一实现做等价验证（避免为测试改导出面）。
function parseFuture(key, fallbackName, f) {
  if (f.length < 9) return null;
  const price = parseFloat(f[0]);
  const prev = parseFloat(f[7]);
  if (!price) return null;
  return {
    key,
    name: f[13] || fallbackName,
    price,
    change: +(price - prev).toFixed(2),
    pct: prev ? +(((price - prev) / prev) * 100).toFixed(2) : 0,
    time: f[6] || null,
    date: f[12] || null,
  };
}

let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// 实测样本（2026-10-30）
const NQ = '28928.220,,28937.250,28938.000,29180.000,28821.500,12:09:56,29562.000,29180.000,0,1,1,2026-10-30,纳斯达克指数期货,0'.split(',');
const ES = '7677.042,,7678.250,7678.750,7713.000,7665.250,12:09:57,7754.250,7709.250,0,20,19,2026-10-30,标普500指数期货,0'.split(',');
const A50 = '12906.620,,12904.000,12905.000,12923.000,12709.000,12:09:58,12899.000,12894.000,1032947,8,3,2026-10-30,富时中国A50期货,307432'.split(',');

console.log('[1] 纳指期货基本解析');
{
  const r = parseFuture('nq', '纳斯达克期货', NQ);
  ok(r.price === 28928.22, '现价取 f[0]，实际 ' + r.price);
  ok(r.pct === -2.14, '涨跌幅以 f[7] 昨收为基准，实际 ' + r.pct + '%');
  ok(r.change === -633.78, '涨跌点，实际 ' + r.change);
  ok(r.name === '纳斯达克指数期货', '名称取 f[13]，实际 ' + r.name);
  ok(r.time === '12:09:56', '行情时间取 f[6]，实际 ' + r.time);
  ok(r.date === '2026-10-30', '日期取 f[12]，实际 ' + r.date);
}

console.log('[2] 标普期货与 A50 口径一致');
{
  const es = parseFuture('es', '标普500期货', ES);
  ok(es.pct === -1, '标普期货涨跌幅，实际 ' + es.pct + '%');
  const a50 = parseFuture('a50', '富时A50期货', A50);
  ok(a50.price === 12906.62 && a50.pct === 0.06, 'A50 与旧实现口径一致，实际 ' + a50.pct + '%');
  ok(a50.name === '富时中国A50期货', 'A50 名称，实际 ' + a50.name);
}

console.log('[3] 名称缺失时回落兜底名');
{
  const f = [...NQ];
  f[13] = '';
  const r = parseFuture('nq', '纳斯达克期货', f);
  ok(r.name === '纳斯达克期货', 'f[13] 空时用 fallback，实际 ' + r.name);
}

console.log('[4] 脏数据不抛错');
{
  ok(parseFuture('nq', 'x', []) === null, '空数组返回 null');
  ok(parseFuture('nq', 'x', ['1', '2']) === null, '字段不足返回 null');
  ok(parseFuture('nq', 'x', ['', '', '', '', '', '', '', '100']) === null, '现价为空的 NaN 返回 null');
  const zero = parseFuture('nq', 'x', ['100', '', '', '', '', '', '12:00:00', '0', '', '', '', '2026-10-30', '名']);
  ok(zero !== null && zero.pct === 0, '昨收为 0 时 pct 归零不产出 NaN/Infinity，实际 ' + (zero && zero.pct));
  ok(zero.change === 100, '昨收为 0 时 change 仍为现价，实际 ' + (zero && zero.change));
}

console.log('[5] GLOBAL_ORDER 用真实 key（腾讯返回 ixic/dji/inx，不是 nasdaq/sp500）');
{
  // 复刻 em.js 的排序表；曾因写成 nasdaq/sp500 让纳指/标普掉到末尾
  const ORDER = { nq: 0, es: 1, ym: 2, a50: 3, ixic: 4, dji: 5, inx: 6, int_hangseng: 7, int_nikkei: 8 };
  const keys = ['nq', 'es', 'ym', 'a50', 'ixic', 'dji', 'inx', 'int_hangseng', 'int_nikkei'];
  ok(keys.every((k) => ORDER[k] !== undefined), '所有真实 key 都在排序表中（无 ?? 99 掉尾）');
  const sorted = [...keys].sort((a, b) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99));
  ok(sorted[0] === 'nq' && sorted[1] === 'es' && sorted[2] === 'ym', '期货排最前');
  ok(sorted.indexOf('ixic') < sorted.indexOf('int_hangseng'), '纳指现货排在恒生之前');
  ok(sorted.indexOf('a50') < sorted.indexOf('ixic'), 'A50 期货排在美股现货之前');
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
