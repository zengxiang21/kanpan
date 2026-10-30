// 移动端溢出回归测试（静态分析，不依赖浏览器）
//
// 背景：用户反馈「手机上有些文案会超出屏幕」。根因是三层叠加：
//   1) .tbl td { white-space: nowrap } —— 桌面端为对齐好看，窄屏下必然横向溢出
//   2) 组件里 20+ 处 td/th 的 inline width:N —— CSS 覆盖不了 inline，
//      且 width 是硬约束无法被压缩，多列累加直接顶破视口
//   3) .reasons-cell 只有 min-width 没有 max-width，长文案把单元格无限撑开
// 另有两个经典陷阱：flex/grid 子项默认 min-width:auto（长内容撑宽容器）、
// 以及 .tp-reasons/.wide-card 写死 260px min-width。
//
// 这个套件把上述修复固化成断言，防止回归。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const COMP_DIR = path.join(ROOT, 'web', 'src', 'components');
const CSS = path.join(ROOT, 'web', 'src', 'styles.css');

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); }
};

const css = fs.readFileSync(CSS, 'utf8');
const jsxFiles = fs.readdirSync(COMP_DIR).filter((f) => f.endsWith('.jsx'));

// 取出手机 media query 块
const mMatch = css.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/);
const mobileBlock = mMatch ? mMatch[1] : '';

console.log('[1] td/th 不再使用 inline width（硬约束，窄屏无法压缩）');
{
  const bad = [];
  for (const f of jsxFiles) {
    const src = fs.readFileSync(path.join(COMP_DIR, f), 'utf8');
    const tagRe = /<(td|th)\b[^>]*>/g;
    let m;
    while ((m = tagRe.exec(src))) {
      const styleRe = /style=\{\{([^}]*)\}\}/.exec(m[0]);
      if (!styleRe) continue;
      // 去掉 maxWidth/minWidth 后，若还剩裸 width: 就是问题
      const stripped = styleRe[1].replace(/(max|min)Width\s*:/g, '');
      if (/(^|[^a-zA-Z])width\s*:/.test(stripped)) {
        bad.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  ok(bad.length === 0, `无 inline width 的 td/th${bad.length ? '，违规：' + bad.join(', ') : ''}`);
}

console.log('[2] 手机端表格改为横向滚动，不能逐字断行（曾经的过度修复）');
{
  // 曾经的错误方案：white-space:normal + overflow-wrap:anywhere + word-break:break-word
  // 中文无空格，anywhere 会在任意字符间断行 → 每列只剩一个字宽，比溢出更难读
  ok(!/\.tbl td,\s*\.tbl th\s*\{[^}]*white-space:\s*normal/.test(mobileBlock), '不再把 td 改成 normal（避免逐字断行）');
  ok(!/\.tbl td[^{]*\{[^}]*overflow-wrap:\s*anywhere/.test(mobileBlock), 'td 不再用 overflow-wrap:anywhere（逐字断的元凶）');
  ok(!/\.tbl td[^{]*\{[^}]*word-break/.test(mobileBlock), 'td 不再用 word-break');
  ok(/\.tbl td,\s*\.tbl th\s*\{[^}]*white-space:\s*nowrap/.test(mobileBlock), 'td/th 保持 nowrap，列宽由内容决定');
  ok(/\.panel\s*\{\s*overflow-x:\s*auto/.test(mobileBlock), '.panel 可横向滚动（窄屏表格的正确解法）');
  ok(/\.tbl\s*\{\s*min-width:\s*max-content/.test(mobileBlock), '.tbl 用 min-width:max-content 按内容展开');
  // 长文案列仍然要能换行
  ok(/\.reasons-cell,\s*\.plan-action,\s*\.case-plain\s*\{[^}]*white-space:\s*normal\s*!important/.test(mobileBlock), '长文案列仍允许换行');
}

console.log('[3] 全局兜底');
{
  ok(/overflow-x:\s*hidden/.test(css), 'body 不产生横向滚动条');
  ok(/overflow-wrap:\s*anywhere/.test(css.split('.shell')[0]), 'body 全局断词');
}

console.log('[4] flex/grid 子项 min-width 归零（默认 auto 会被长内容撑宽）');
{
  ok(/\.panel,\s*\.row2\s*>\s*\*,\s*\.ranks\s*>\s*\*,\s*\.cards\s*>\s*\*\s*\{\s*min-width:\s*0/.test(mobileBlock), 'panel/row2/ranks/cards 子项归零');
  ok(/\.tp-reasons,\s*\.wide-card\s*\{\s*min-width:\s*0\s*!important/.test(mobileBlock), '260px 写死宽度的两个类归零');
  // chip 相反：必须保留足够 min-width，否则票名（最多4汉字）被压到逐字竖排
  ok(!/\.lp-cell\s*\{\s*min-width:\s*0/.test(mobileBlock), 'lp-cell 不再被归零')
  ok(/\.stock-chip\s*\{\s*min-width:\s*8\d/.test(mobileBlock), 'stock-chip 有足够 min-width 显示票名')
  ok(/\.lp-cell\s*\{\s*min-width:\s*1\d\d/.test(mobileBlock), 'lp-cell 有足够 min-width 显示票名')
  ok(/\.stock-chip b\s*\{\s*white-space:\s*nowrap/.test(mobileBlock), 'chip 内票名不换行')
  ok(/\.score-cell\s*\{\s*min-width:\s*0\s*!important/.test(mobileBlock), '评分列归零');
}

console.log('[5] .reasons-cell 有上限（原来只有 min-width，长文案无限撑开）');
{
  ok(/\.reasons-cell\s*\{[^}]*max-width/.test(css), '桌面端有 max-width');
  ok(/\.reasons-cell\s*\{[^}]*max-width:\s*100%\s*!important/.test(mobileBlock), '手机端 max-width 100%');
}

console.log('[6] 防御性规则：万一再有人写 inline width');
{
  ok(/\.tbl td\[style\*="width"\][\s\S]{0,80}width:\s*auto\s*!important/.test(mobileBlock), 'inline width 被强制转 auto');
  ok(!/\.tbl td\[style\*="width"\][^}]*max-width/.test(mobileBlock), '不同时覆盖 max-width（否则放宽合理列宽上限）');
}

console.log('[7] 长文案容器可换行');
{
  ok(/\.hint[^}]*overflow-wrap:\s*anywhere/.test(mobileBlock), 'hint 断词');
  ok(/\.plan-action,\s*\.case-plain\s*\{[^}]*white-space:\s*normal\s*!important/.test(mobileBlock), '计划/案例文案换行');
}

console.log('[8] 构建产物同步（若存在 dist）');
{
  const distDir = path.join(ROOT, 'web', 'dist', 'assets');
  const files = fs.existsSync(distDir) ? fs.readdirSync(distDir).filter((f) => f.endsWith('.css')) : [];
  if (!files.length) {
    console.log('  --   跳过（未构建）');
  } else {
    const built = fs.readFileSync(path.join(distDir, files[0]), 'utf8');
    ok(built.includes('white-space:normal!important'), '产物含表格换行规则');
    ok(built.includes('overflow-x:hidden'), '产物含 body 防横滚');
    ok(built.includes('min-width:0!important'), '产物含 min-width 归零');
    ok(/\.hint[^{]*\{[^}]*overflow-wrap:anywhere/.test(built), '产物含 hint 断词');
  }
}

console.log('[9] 顶部 tab 栏与横滑体验（用户先反馈「不好滑动」，再要求「不在底部」）');
{
  // 菜单栏已从底部移到顶部：底部会挡住内容、横滑也容易和系统手势冲突
  ok(/\.sidebar\s*\{[^}]*top:\s*0/.test(mobileBlock), '菜单栏固定在顶部');
  ok(!/\.sidebar\s*\{[^}]*bottom:\s*0/.test(mobileBlock), '不再固定底部');
  ok(/\.sidebar\s*\{[^}]*border-bottom:/.test(mobileBlock), '分隔线改为下边框（顶部栏在内容上方）');
  ok(!/\.sidebar\s*\{[^}]*border-top:/.test(mobileBlock), '不再用上边框');
  // 内容区留白方向要从底部避让改成顶部避让
  ok(/\.content\s*\{\s*padding:\s*5\dpx/.test(mobileBlock), '内容区上方留白（避开顶部菜单栏）');
  ok(!/\.content\s*\{[^}]*padding:[^}]*120px/.test(mobileBlock), '不再留 120px 底部避让');
  // 表头吸顶必须避开菜单栏，否则被 tab 压住
  ok(/\.tbl th\s*\{\s*top:\s*4\dpx/.test(mobileBlock), '表头吸顶下移到菜单栏之下');

  // ---- 以下为横滑体验（上一轮修复，需保持） ----
  ok(!/\.sidebar\s*\{[^}]*overflow-x:\s*auto/.test(mobileBlock), '.sidebar 自身不再横滚（否则 logo/状态栏被拖走）');
  ok(/\.menu\s*\{[^}]*flex:\s*1/.test(mobileBlock), '.menu 占满剩余宽度');
  ok(/\.menu\s*\{[^}]*min-width:\s*0/.test(mobileBlock), '.menu min-width:0——否则 flex 子项不收缩、根本滚不起来');
  ok(/\.menu\s*\{[^}]*overflow-x:\s*auto/.test(mobileBlock), '横滚落在 .menu 上');
  ok(/-webkit-overflow-scrolling:\s*touch/.test(mobileBlock), 'iOS 惯性滚动');
  ok(/overscroll-behavior-x:\s*contain/.test(mobileBlock), '防止横滑触发浏览器返回手势');
  ok(/scroll-snap-type:\s*x proximity/.test(mobileBlock), '滑动吸附');
  ok(/\.menu-item\s*\{[^}]*scroll-snap-align:\s*center/.test(mobileBlock), 'tab 参与吸附对齐');
  ok(/scrollbar-width:\s*none/.test(mobileBlock), '隐藏滚动条');
  ok(/\.menu::-webkit-scrollbar\s*\{\s*display:\s*none/.test(mobileBlock), 'WebKit 也隐藏滚动条');
  // 视觉提示：没有它用户不知道能横滑
  ok(/\.sidebar::before,[\s\S]{0,80}\.sidebar::after\s*\{/.test(mobileBlock), '有两侧渐隐遮罩');
  ok(/\.sidebar::before\s*\{[^}]*linear-gradient/.test(mobileBlock), '左侧渐变');
  ok(/\.sidebar::after\s*\{[^}]*linear-gradient/.test(mobileBlock), '右侧渐变');
  ok(/\.sidebar::(before|after),\s*\.sidebar::(before|after)\s*\{[^}]*pointer-events:\s*none/.test(mobileBlock), '遮罩不挡点击');
  // 状态栏必须固定
  ok(/\.sidebar-foot\s*\{[^}]*flex:\s*none/.test(mobileBlock), 'sidebar-foot 不参与横滑');

  // ---- 右侧固定区要瘦身，把宽度让给可横滑菜单（用户反馈「滑动条太小，右侧固定的太多」）----
  ok(/\.sidebar-foot\s*\.day,[\s\S]{0,40}\.sidebar-foot\s*\.fallback-badge\s*\{\s*display:\s*none/.test(mobileBlock), '手机端隐藏日期与备源角标（二者页面另有展示，却白占约90px）');
  ok(!/\.sidebar-foot\s*\.ts\s*\{\s*display:\s*none/.test(mobileBlock), '保留时间（数据新鲜度是关键信息）');
  ok(!/\.sidebar-foot\s*\.phase\s*\{\s*display:\s*none/.test(mobileBlock), '保留交易阶段');
  ok(/\.brand\s*\.logo\s*\{\s*width:\s*2\dpx/.test(mobileBlock), 'logo 缩小，让位菜单');
}

console.log('[10] 状态灯样式（此前 .dot/.ts/.phase/.day/.fallback-badge 完全无样式定义）');
{
  // .dot 原本是个没有 width/height 的空 div —— 实时状态灯其实从来没显示过
  ok(/\.dot\s*\{[^}]*width:\s*\d+px/.test(css), '.dot 有尺寸（否则状态灯不可见）');
  ok(/\.dot\s*\{[^}]*border-radius:\s*50%/.test(css), '.dot 是圆形');
  ok(/\.dot\.on\s*\{/.test(css), '有 .dot.on 在线态');
  ok(/\.dot\.on\s*\{[^}]*background/.test(css), '在线态有颜色');
  ok(/\.sidebar-foot\s*\.phase\s*\{/.test(css), '.phase 有样式（阶段文字可读）');
  ok(/\.fallback-badge\s*\{/.test(css), '.fallback-badge 有样式（桌面端可见）');
  ok(/\.sidebar-foot\s*\.ts\s*\{[^}]*tabular-nums/.test(css), '时间用等宽数字，刷新时不抖动');
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
