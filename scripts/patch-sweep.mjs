// 补丁：sweep 加 90s 总时限 + 历史下载改用行业映射清单 + sweep 频率降为盘中 2 分钟
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// --- em.js: sinaFullSweep deadline ---
{
  const p = root + 'server/src/em.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('DEADLINE')) {
    s = s.replace(
      "export async function sinaFullSweep(onProgress) {\n  const countTxt",
      "export async function sinaFullSweep(onProgress) {\n  const DEADLINE = Date.now() + 90_000; // 总时限：超时返回已抓部分（部分数据也够用）\n  const countTxt"
    );
    s = s.replace(
      "    onProgress?.(p, pages);\n    await new Promise((res) => setTimeout(res, 120));\n  }",
      "    onProgress?.(p, pages);\n    if (Date.now() > DEADLINE) { console.warn('[sweep] 90秒时限到，返回部分数据 ' + rows.length + ' 只'); break; }\n    await new Promise((res) => setTimeout(res, 120));\n  }"
    );
    fs.writeFileSync(p, s);
    console.log('em.js: sweep deadline OK');
  } else console.log('em.js: 已有 deadline');
}

// --- state.js: sweep 频率盘中降为 2 分钟 + history kick 用行业映射清单优先 ---
{
  const p = root + 'server/src/state.js';
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(
    "  async function sweepOnce() {\n    await runSweep();",
    "  async function sweepOnce() {\n    if (Date.now() - lastSweepTry < 110_000) return; // 盘中最多 2 分钟一轮\n    lastSweepTry = Date.now();\n    await runSweep();"
  );
  if (!s.includes('lastSweepTry')) {
    s = s.replace('  let sweepBusy = false;', '  let sweepBusy = false;\n  let lastSweepTry = 0;');
  }
  s = s.replace(
    "      if (!historyKicked && state.marketSweep) {\n        historyKicked = true;\n        ensureHistoryStarted(() => (state.marketSweep ? state.marketSweep.rows.map((r) => r.code) : null));\n        ensureIndustryMapStarted();\n      }",
    "      if (!historyKicked) {\n        historyKicked = true;\n        ensureIndustryMapStarted();\n        // 优先用行业映射清单（构建快且独立于 sweep）\n        const codesFromMap = Object.keys(industryState?.map || {});\n        ensureHistoryStarted(() => {\n          const fromMap = Object.keys(industryMapState());\n          if (fromMap.length > 1000) return fromMap;\n          return state.marketSweep ? state.marketSweep.rows.map((r) => r.code) : null;\n        });\n        void codesFromMap;\n      }"
  );
  fs.writeFileSync(p, s);
  console.log('state.js: sweep 频率 + history kick OK');
}

// --- history.js: 支持 ensureHistoryStarted 的清单回调已存在，无需改 ---
console.log('全部补丁完成');
