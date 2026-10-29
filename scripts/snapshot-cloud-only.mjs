// 只从本地服务拉数据生成 docs/cloud/data.json，不做 git commit/push
// 用法: node scripts/snapshot-cloud-only.mjs  (需本地 8000 端口服务在跑)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const get = async (p) => (await fetch('http://127.0.0.1:8000/api/' + p)).json();

const [tickPools, review, scan, auction, global, us, sentiment, sectors, news, heatmap, leaders, anomalyToday, anomalyDates, earnings] = await Promise.all([
  get('snapshot'), get('review'), get('scan'), get('auction'),
  get('global').catch(() => []), get('us').catch(() => []), get('sentiment').catch(() => ({ themes: [] })),
  get('sectors').catch(() => []), get('news').catch(() => []),
  get('heatmap').catch(() => ({ groups: [] })), get('leaders').catch(() => null),
  get('anomaly/today').catch(() => ({ events: [] })), get('anomaly/dates').catch(() => []),
  get('earnings/us?days=60').catch(() => ({ events: [] })),
]);

if (!tickPools.tick) {
  console.error('[snapshot-cloud] 本地服务 tick 为 null，终止（不要把空快照推到 Pages）');
  process.exit(1);
}

const data = {
  generatedAt: Date.now(),
  phase: tickPools.tick?.phase,
  tradingDay: tickPools.tradingDay,
  snapshot: { tick: tickPools.tick, pools: tickPools.pools },
  review, scan, auction, global, us, sentiment, sectors, news, heatmap, leaders,
  anomaly: { today: anomalyToday, dates: anomalyDates },
  earnings,
};

const outFile = path.join(ROOT, 'docs', 'cloud', 'data.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(data));
console.log('[snapshot-cloud] 已写入', outFile);
console.log('  tradingDay =', data.tradingDay, '| phase =', data.phase);
console.log('  tick.cycleStage =', data.snapshot.tick.cycleStage, '| zt =', data.snapshot.tick.ztCount);
console.log('  review.emotion.cycleStage =', data.review?.emotion?.cycleStage);
  console.log('  anomaly events =', data.anomaly?.today?.count ?? 0, '| dates =', (data.anomaly?.dates || []).length);
process.exit(0);
