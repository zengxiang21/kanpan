// 修正 history kick 的行业映射引用
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const p = root + 'server/src/state.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { loadIndustryMap, ensureIndustryMapStarted } from './industries.js';",
  "import { loadIndustryMap, ensureIndustryMapStarted, industryState } from './industries.js';"
);
s = s.replace(
  "        ensureHistoryStarted(() => {\n          const fromMap = Object.keys(industryMapState());\n          if (fromMap.length > 1000) return fromMap;\n          return state.marketSweep ? state.marketSweep.rows.map((r) => r.code) : null;\n        });",
  "        ensureHistoryStarted(() => {\n          const fromMap = Object.keys(industryState.map || {});\n          if (fromMap.length > 1000) return fromMap;\n          return state.marketSweep ? state.marketSweep.rows.map((r) => r.code) : null;\n        });"
);
fs.writeFileSync(p, s);
console.log('修正完成:', s.includes('industryState } from'), s.includes('industryState.map'));
