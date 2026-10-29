// 补丁 B3 修正版：tick 增加 cycleStage（用本地 premium），PreMarket 周期打法
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// 1) review.js: 导出 cycleStage
{
  const p = root + 'server/src/review.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('export function cycleStage')) {
    s = s.replace('function cycleStage(', 'export function cycleStage(');
    fs.writeFileSync(p, s);
    console.log('review.js cycleStage 导出 OK');
  }
}

// 2) state.js: import + tick.cycleStage（用 refreshTick 本地的 premium 对象）
{
  const p = root + 'server/src/state.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes("cycleStage } from './review.js'")) {
    s = s.replace(
      "import { buildReview, saveReviewIfNeeded, latestSavedReview, buildPlans, reviewDates, reviewByDate, cycleStage } from './review.js';",
      "import { buildReview, saveReviewIfNeeded, latestSavedReview, buildPlans, reviewDates, reviewByDate } from './review.js';\nimport { cycleStage } from './review.js';"
    );
  }
  if (!s.includes('cycleStage: cycleStage({')) {
    s = s.replace(
      "    emotionLabel: emotionLabel(ztCount, zhaRate ?? 0, maxLianban),",
      `    emotionLabel: emotionLabel(ztCount, zhaRate ?? 0, maxLianban),
    cycleStage: cycleStage({ ztCount, dtCount: state.pools.dt.length, zbCount, zhaRate, maxLianban, premium }).stage,
    cycleDesc: cycleStage({ ztCount, dtCount: state.pools.dt.length, zbCount, zhaRate, maxLianban, premium }).length > 1 ? cycleStage({ ztCount, dtCount: state.pools.dt.length, zbCount, zhaRate, maxLianban, premium }).desc || '' : '',`
    );
  }
  fs.writeFileSync(p, s);
  console.log('state.js cycleStage OK');
}
console.log('B3 后端完成');
