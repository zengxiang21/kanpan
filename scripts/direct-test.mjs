// 直接调用数据函数，定位 setInterval 不触发的问题
import { state, runSweep, refreshTick } from '../server/src/state.js';

console.log('1) runSweep 开始…');
await runSweep();
console.log('2) sweep 完成 rows=', state.marketSweep?.rows?.length);

await refreshTick();
console.log('3) tick 完成 updatedAt=', state.tick?.updatedAt ? new Date(state.tick.updatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : 'NULL', '| 涨停', state.tick?.ztCount);

process.exit(0);
