// 大盘云图交互测试（静态断言，不依赖浏览器）
//
// 背景：用户反馈「大盘云图点击票都在最下面，看着不方便」。
// 根因有两条：
//   1) 详情面板渲染在云图网格之后，而云图有几百个格子，
//      点击后面板被推到屏幕外，用户看不到任何反馈
//   2) 选中的格子没有任何高亮（clsOf 不含选中态），
//      即使滚回去也找不到刚才点的是哪个
// 修复：加选中态样式 + 点击后 scrollIntoView 把面板带到视口。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const jsx = fs.readFileSync(path.join(ROOT, 'web/src/components/HeatmapPage.jsx'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'web/src/styles.css'), 'utf8');

console.log('[1] 选中态：clsOf 接收 pickedIndustry 并输出 hm-picked');
{
  ok(/function clsOf\(g,\s*pickedIndustry\)/.test(jsx), 'clsOf 签名含 pickedIndustry');
  ok(/const on = pickedIndustry === g\.industry \? ' hm-picked' : ''/.test(jsx), '命中时加 hm-picked class');
  ok(/className=\{clsOf\(g,\s*picked\?\.industry\)\}/.test(jsx), 'grid 调用时传入 picked?.industry');
}

console.log('[2] 点击后把详情面板滚到视口（云图有几百个格子，不滚就在屏幕外）');
{
  ok(/const detailRef = useRef\(null\)/.test(jsx), '有 detailRef');
  ok(/detailRef\}/.test(jsx), '详情面板绑定了 ref');
  ok(/requestAnimationFrame\(\(\) => \{[\s\S]{0,120}scrollIntoView/.test(jsx), '用 rAF 包裹 scrollIntoView（等渲染完再滚）');
  ok(/scrollIntoView\(\{\s*block:\s*'nearest'/.test(jsx), 'block:nearest——既露出面板又保留部分云图上下文');
  ok(/behavior:\s*'smooth'/.test(jsx), '平滑滚动，不突兀跳转');
  ok(/if \(!picked\) return;/.test(jsx), '取消选中时不滚（避免把页面拽走）');
  ok(/cancelAnimationFrame\(id\)/.test(jsx), '清理 rAF，防止快速切换时残留回调');
  ok(/import \{ useEffect, useRef, useState \}/.test(jsx), 'useRef 已导入');
}

console.log('[3] 选中态样式：不能改背景色（会与涨跌配色冲突）');
{
  ok(/\.hm-cell\.hm-picked\s*\{/.test(css), '有 .hm-cell.hm-picked 规则');
  const pickedBlock = (/\.hm-cell\.hm-picked\s*\{([^}]*)\}/.exec(css) || [, ''])[1];
  ok(/outline:/.test(pickedBlock), '用 outline 高亮');
  ok(!/background/.test(pickedBlock), '不改 background（格子背景已表示涨跌幅，改了会冲突）');
  ok(/box-shadow/.test(pickedBlock), '有外圈光晕，远看也明显');
  ok(/transform:/.test(pickedBlock), '轻微放大，进一步区分');
  ok(/z-index:/.test(pickedBlock), '提层级，避免被相邻格子盖住');
  ok(/\.hm-cell\.hm-picked:hover\s*\{/.test(css), 'picked + hover 时保持放大（不被 hover 规则覆盖回原样）');
  ok(/\.hm-detail-panel\s*\{/.test(css), '详情面板有强调样式');
}

console.log('[4] 不与既有规则冲突');
{
  // 手机端 .hm-cell 有固定 height，选中放大不应改变布局高度
  ok(/@media \(max-width: 720px\)[\s\S]{0,200}\.hm-cell \{ height: 70px/.test(css), '手机端格子仍是固定高度（transform 不影响布局）');
  // 选中态在 media query 之外定义，桌面/手机都生效
  const pickedIdx = css.indexOf('.hm-cell.hm-picked');
  const mediaIdx = css.lastIndexOf('@media (max-width: 720px)', pickedIdx);
  ok(pickedIdx > mediaIdx, '选中态规则在 720px media query 之后定义（两端都生效）');
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
