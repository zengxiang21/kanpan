// 直接调用 scanAll + reflowScan 定位挂点
import { loadHistory, historyState } from '../server/src/history.js';
import { state, runSweep, refreshTick } from '../server/src/state.js';
import { scanAll, reflowScan } from '../server/src/scan.js';
import { getPool } from '../server/src/em.js';

loadHistory();
console.log('0) 历史库载入', Object.keys(historyState.bars).length, '只');

console.log('1) runSweep…');
const t0 = Date.now();
state.pools.zt = await getPool('ZT', '20261028').catch(() => []);
state.pools.prevZt = await getPool('ZT', '20261027').catch(() => []);
await runSweep();
console.log('2) sweep 完成 rows=', state.marketSweep?.rows?.length, '耗时', Date.now() - t0, 'ms');

console.log('3) scanAll…');
const t1 = Date.now();
const scan = scanAll(state.marketSweep);
console.log('4) scanAll 完成', scan.fangliang.length, '/', scan.huita.length, '耗时', Date.now() - t1, 'ms');

console.log('5) reflowScan…');
const t2 = Date.now();
const reflow = reflowScan(state.marketSweep, state.pools);
console.log('6) reflowScan 完成', reflow.length, '耗时', Date.now() - t2, 'ms');

process.exit(0);
