// 从本地服务拉最新数据 → 更新 docs/cloud/data.json → 提交推送到 GitHub Pages
// 由服务器 loopReview 在交易时段每 5 分钟调用；电脑开着就自动云端同步
//
// 可配置项（环境变量，均有默认值，换机器不用改代码）：
//   KANPAN_PORT    本地服务端口          默认 8000
//   KANPAN_GIT     git 可执行文件        默认按平台自动探测，找不到回退 'git'
//   KANPAN_GH      gh CLI 可执行文件     默认按平台自动探测，找不到回退 'gh'
//   KANPAN_PROXY   推送用 HTTP 代理      默认空（不走代理）
//   GH_TOKEN       GitHub token          优先用环境变量；未设则尝试 `gh auth token`
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.KANPAN_PORT || '8000';

// 在 PATH 与常见安装位置里找可执行文件；找不到就退回裸命令名（交给系统 PATH 解析）
function which(names) {
  for (const n of names) {
    try {
      const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', [n], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (found.length) return found[0];
    } catch { /* 继续找下一个 */ }
  }
  return names[0];
}
const GIT = process.env.KANPAN_GIT || which(['git', 'C:/Program Files/Git/bin/git.exe']);
const GH = process.env.KANPAN_GH || which(['gh', 'C:/Program Files/GitHub CLI/gh.exe']);
const PROXY = process.env.KANPAN_PROXY || '';

const get = async (p) => (await fetch(`http://127.0.0.1:${PORT}/api/` + p)).json();

// token 只从环境变量或 gh keyring 取，全程留在内存，不落任何文件
function resolveToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  return execFileSync(GH, ['auth', 'token'], { encoding: 'utf8' }).trim();
}

async function main() {
  const [tickPools, review, scan, auction, global, us, sentiment, sectors, news, heatmap, leaders] = await Promise.all([
    get('snapshot'), get('review'), get('scan'), get('auction'),
    get('global').catch(() => []), get('us').catch(() => []), get('sentiment').catch(() => ({ themes: [] })),
    get('sectors').catch(() => []), get('news').catch(() => []),
    get('heatmap').catch(() => ({ groups: [] })), get('leaders').catch(() => null),
  ]);

  // 行情未就绪时不推送：不要把空快照发到 Pages（手机/演示站会全板块空白）
  if (!tickPools.tick) {
    console.log('[push-cloud] 本地 tick 未就绪，跳过本次推送');
    return;
  }

  const data = {
    generatedAt: Date.now(), phase: tickPools.tick?.phase, tradingDay: tickPools.tradingDay,
    snapshot: { tick: tickPools.tick, pools: tickPools.pools },
    review, scan, auction, global, us, sentiment, sectors, news, heatmap, leaders,
  };
  const outFile = path.join(ROOT, 'docs', 'cloud', 'data.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  const next = JSON.stringify(data);
  if (prev === next) { console.log('[push-cloud] 无变化'); return; }
  fs.writeFileSync(outFile, next);

  // token 通过 header 传递，不写凭证文件、不靠 credential.helper
  const token = resolveToken();
  const authHeader = `Authorization: Basic ${Buffer.from(`zengxiang21:${token}`).toString('base64')}`;
  const g = (args, extra = []) => execFileSync(GIT, [...args, ...extra], { cwd: ROOT, encoding: 'utf8' });
  g(['add', 'docs/cloud/data.json']);
  g(['-c', 'user.name=kanpan', '-c', 'user.email=kanpan@local', 'commit', '-m',
    `cloud data ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`]);
  const pushArgs = ['-c', 'credential.helper=', '-c', `http.extraHeader=${authHeader}`, 'push'];
  if (PROXY) pushArgs.unshift('-c', `http.proxy=${PROXY}`);
  g(pushArgs);
  console.log('[push-cloud] 已推送云端快照', new Date().toLocaleTimeString('zh-CN', { hour12: false }));
}

main().catch((e) => { console.error('[push-cloud]', e.message); process.exit(1); });
