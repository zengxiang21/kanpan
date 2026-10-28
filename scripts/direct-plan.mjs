// 复现 /api/plan auto 完整链路，逐步计时定位挂点
import { state, runSweep, refreshTick, marketPhase } from '../server/src/state.js';
import { getPool, getLHBCodes } from '../server/src/em.js';
import { scanAll, reflowScan, auctionScan } from '../server/src/scan.js';
import { buildPlans } from '../server/src/review.js';
import { loadHistory, historyState } from '../server/src/history.js';
import { loadIndustryMap } from '../server/src/industries.js';

const step = (n, msg, t0) => console.log(`[${n}] ${msg} +${Date.now() - t0}ms`);

const T0 = Date.now();
loadHistory();
loadIndustryMap();
step(0, '模块载入', T0);

state.pools.zt = await getPool('ZT', '20261028').catch(() => []);
state.pools.prevZt = await getPool('ZT', '20261027').catch(() => []);
step(1, '涨停池', T0);

await runSweep();
step(2, 'sweep ' + (state.marketSweep?.rows?.length || 0) + ' 只', T0);

const scan = scanAll(state.marketSweep);
step(3, `scanAll ${scan.fangliang.length}/${scan.huita.length}`, T0);

const reflow = reflowScan(state.marketSweep, state.pools);
step(4, 'reflowScan ' + reflow.length, T0);

console.log('5) auctionScan…');
const auction = await auctionScan(state.marketSweep, state.pools, marketPhase(), {}).catch((e) => { console.log('auctionScan FAIL', e.message); return { directions: [] }; });
step(5, 'auctionScan 方向' + (auction.directions || []).length, T0);

const ztTop = [...state.pools.zt].sort((a, b) => (b.lianban || 1) - (a.lianban || 1))[0];
const codes = [ztTop?.code, reflow[0]?.code, scan.fangliang[0]?.code].filter(Boolean).slice(0, 3);
console.log('6) buildPlans codes=', codes.join(','));
const plans = await buildPlans(codes, state);
step(7, `buildPlans ${plans.length} 张`, T0);
plans.forEach((p) => console.log('  ', p.name, '|', p.from, '|', p.mode));

process.exit(0);
