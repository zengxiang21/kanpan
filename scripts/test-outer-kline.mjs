// 外盘 K 线路由与数据归一化测试（离线部分）+ 线上接口验证
//
// 背景：外盘详情页（FutureDetail）与 A 股详情页（StockDetail）是两套数据源，
// 靠 code 前缀分流。曾经因为用行号做批量替换，把 /api/kline 和 /api/future/kline
// 的函数体写反了（A股路由调了外盘函数、外盘路由调了 A股函数），
// 导致 hf_NQ 走进 history.js 报"空K线"，且 A 股 ^\d{6}$ 校验直接 400。
// 这个套件把「路由 → 函数」的对应关系固化成断言，防止再犯。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const idx = fs.readFileSync(path.join(ROOT, 'server/src/index.js'), 'utf8');
const fut = fs.readFileSync(path.join(ROOT, 'server/src/futures.js'), 'utf8');

/** 取某个路由块的函数体文本 */
function routeBody(routePath) {
  const i = idx.indexOf(`app.get('${routePath}'`);
  if (i < 0) return null;
  const end = idx.indexOf('\n});', i);
  return idx.slice(i, end);
}

console.log('[1] 路由与函数一一对应（曾经的 bug：两个路由函数体被互换）');
{
  const a = routeBody('/api/kline');
  const f = routeBody('/api/future/kline');
  ok(a !== null && a.includes('await getKline(code, limit)'), '/api/kline 调 history.js 的 getKline（A股）');
  ok(a !== null && !a.includes('getOuterKline'), '/api/kline 不碰外盘函数');
  ok(f !== null && f.includes('await getOuterKline(code, limit)'), '/api/future/kline 调 futures.js 的 getOuterKline');
  ok(f !== null && !/await getKline\(/.test(f), '/api/future/kline 不碰 A股函数');
}

console.log('[2] 导入不重名（getKline 曾被 history.js 和 futures.js 同时导出，直接 SyntaxError 起不来）');
{
  ok(/import\s*\{\s*historyState,\s*getKline\s*\}\s*from\s*'\.\/history\.js'/.test(idx), 'history.js 的 getKline 原样导入');
  ok(/import\s*\{\s*getKline as getOuterKline/.test(idx), 'futures.js 的 getKline 用别名导入');
  ok(/getQuote as getOuterQuote/.test(idx), 'futures.js 的 getQuote 用别名导入');
  // 同一作用域不能重复声明
  const decls = idx.match(/^import\s*\{[^}]*\}/gm) || [];
  const names = [];
  for (const d of decls) {
    for (const part of d.replace(/^import\s*\{|\}$/g, '').split(',')) {
      const m = /(?:\sas\s+(\w+)|\s*(\w+))\s*$/.exec(part.trim());
      if (m) names.push(m[1] || m[2]);
    }
  }
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  ok(dup.length === 0, `导入名无重复${dup.length ? '：' + dup.join(',') : ''}`);
}

console.log('[3] 外盘 bars 格式与 A 股一致（否则 CandleChart 复用会画错）');
{
  // A股 history.js: [day, open, close, high, low, volume]
  const his = fs.readFileSync(path.join(ROOT, 'server/src/history.js'), 'utf8');
  ok(/\[b\.day,\s*\+b\.open,\s*\+b\.close,\s*\+b\.high,\s*\+b\.low/.test(his), 'A股 bars = [day, open, close, high, low, ...]');
  ok(/\[b\.date,\s*\+b\.open,\s*\+b\.close,\s*\+b\.high,\s*\+b\.low/.test(fut), '期货 bars 同构');
  ok(/\[b\[0\],\s*\+b\[1\],\s*\+b\[2\],\s*\+b\[3\],\s*\+b\[4\]/.test(fut), '美股指数 bars 同构（腾讯数组格式）');
}

console.log('[4] 前缀分流覆盖两类品种');
{
  ok(/c\.startsWith\('hf_'\)/.test(fut) && /c\.startsWith\('us'\)/.test(fut), 'futures.js 按 hf_/us 前缀分流');
  const app = fs.readFileSync(path.join(ROOT, 'web/src/App.jsx'), 'utf8');
  ok(/startsWith\('hf_'\)/.test(app), 'App.jsx 对 hf_ 前缀走 FutureDetail');
  // 注意：us 前缀也必须走 FutureDetail，否则会进 StockDetail 然后被 ^\d{6}$ 拒
  ok(/String\(stock\.code\)\.startsWith\('hf_'\)/.test(app), 'App.jsx 分流条件存在');
}

console.log('[5] CandleChart 支持自定义数据源');
{
  const cc = fs.readFileSync(path.join(ROOT, 'web/src/components/CandleChart.jsx'), 'utf8');
  ok(/src\s*\}\s*=\s*\{/.test(cc) || /\(\{\s*code,\s*name,\s*src\s*\}/.test(cc), 'CandleChart 接收 src prop');
  ok(/src\s*\|\|\s*`\/api\/kline/.test(cc), 'src 缺省回落 /api/kline（A股不受影响）');
}

console.log('[6] 线上接口验证（需要服务在跑）');
{
  const base = 'http://127.0.0.1:8000';
  const cases = [
    ['hf_NQ', '纳斯达克期货日K'],
    ['hf_ES', '标普期货日K'],
    ['hf_YM', '道指期货日K'],
    ['hf_CHA50CFD', 'A50期货日K'],
    ['usIXIC', '纳指现货日K'],
    ['usDJI', '道指现货日K'],
    ['usINX', '标普现货日K'],
  ];
  for (const [code, label] of cases) {
    try {
      const r = await fetch(`${base}/api/future/kline?code=${code}&limit=20`);
      const j = await r.json();
      if (!r.ok) { ok(false, `${label} 接口报错: ${j.error}`); continue; }
      const b = j.bars;
      const fmtOk = Array.isArray(b) && b.length > 0
        && typeof b[0][0] === 'string'
        && [1, 2, 3, 4, 5].every((i) => Number.isFinite(b[0][i]));
      ok(fmtOk, `${label}：${b.length} 根，格式/数值有效`);
    } catch (e) {
      ok(false, `${label} 请求失败: ${e.message}`);
    }
  }
  // 非法 code 必须 502 带明确错误，不能 200 空数据
  try {
    const r = await fetch(`${base}/api/future/kline?code=hf_XXX`);
    const j = await r.json();
    ok(r.status === 502 && /不支持/.test(j.error || ''), '非法期货代码返回 502 且错误明确');
  } catch (e) {
    ok(false, `非法代码请求失败: ${e.message}`);
  }
  // A股 K 线不能被外盘改动破坏
  try {
    const r = await fetch(`${base}/api/kline?code=600118&limit=10`);
    const j = await r.json();
    ok(r.ok && Array.isArray(j.bars) && j.bars.length > 0, `A股 600118 日K 仍正常（${j.bars?.length} 根）`);
  } catch (e) {
    ok(false, `A股 K线回归失败: ${e.message}`);
  }
  try {
    const r = await fetch(`${base}/api/kline?code=hf_NQ`);
    const j = await r.json();
    ok(r.status === 400 && j.error === 'bad code', 'A股接口仍拒绝非 6 位代码（未被外盘改动破坏）');
  } catch (e) {
    ok(false, `A股校验回归失败: ${e.message}`);
  }
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
