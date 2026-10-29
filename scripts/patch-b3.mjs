// 补丁：B3 盘前周期打法 + E1 复盘增强（炸板归因/亏钱来源）
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// --- review.js: 导出 cycleStage 供复用 ---
{
  const p = root + 'server/src/review.js';
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace('function cycleStage(', 'export function cycleStage(');
  fs.writeFileSync(p, s);
  console.log('review.js cycleStage 导出 OK');
}

// --- state.js: tick 增加 cycleStage ---
{
  const p = root + 'server/src/state.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('cycleStage: stage')) {
    s = s.replace(
      "import { buildReview, saveReviewIfNeeded, latestSavedReview, buildPlans, reviewDates, reviewByDate } from './review.js';",
      "import { buildReview, saveReviewIfNeeded, latestSavedReview, buildPlans, reviewDates, reviewByDate, cycleStage } from './review.js';"
    );
    // refreshTick 里在 emotionLabel 之后计算周期
    s = s.replace(
      "    emotionLabel: emotionLabel(ztCount, zhaRate ?? 0, maxLianban),",
      `    emotionLabel: emotionLabel(ztCount, zhaRate ?? 0, maxLianban),
    cycleStage: (() => { try { return cycleStage({ ztCount, dtCount: state.pools.dt.length, zbCount, zhaRate, maxLianban, premium: state.pools.prevZt?.length ? null : null, premiumAvg: null }).stage; } catch { return ''; } })(),`
    );
    fs.writeFileSync(p, s);
    console.log('state.js cycleStage OK');
  }
}
console.log('完成');
