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

console.log('[2] 手机端解除表格 nowrap（核心修复）');
{
  ok(/\.tbl td,\s*\.tbl th\s*\{[^}]*white-space:\s*normal\s*!important/.test(mobileBlock), '.tbl td/th 白-space 转 normal');
  ok(/overflow-wrap:\s*anywhere/.test(mobileBlock), '单元格强制断词');
  ok(/word-break:\s*break-word/.test(mobileBlock), '单元格 break-word');
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
  ok(/\.lp-cell\s*\{\s*min-width:\s*0\s*!important/.test(mobileBlock), '云图格子归零');
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

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
