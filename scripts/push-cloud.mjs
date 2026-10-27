// 从本地服务拉最新数据 → 更新 docs/cloud/data.json → 提交推送到 GitHub Pages
// 由服务器 loopReview 在交易时段每 5 分钟调用；电脑开着就自动云端同步
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const GIT = 'C:/Program Files/Git/bin/git.exe';
const GH = 'C:/Program Files/GitHub CLI/gh.exe';

const get = async (p) => (await fetch('http://127.0.0.1:8000/api/' + p)).json();

async function main() {
  const [tickPools, review, scan, auction, global, us, sentiment, sectors, news] = await Promise.all([
    get('snapshot'), get('review'), get('scan'), get('auction'),
    get('global').catch(() => []), get('us').catch(() => []), get('sentiment').catch(() => ({ themes: [] })),
    get('sectors').catch(() => []), get('news').catch(() => []),
  ]);
  const data = {
    generatedAt: Date.now(), phase: tickPools.tick?.phase, tradingDay: tickPools.tradingDay,
    snapshot: { tick: tickPools.tick, pools: tickPools.pools },
    review, scan, auction, global, us, sentiment, sectors, news,
  };
  const outFile = path.join(ROOT, 'docs', 'cloud', 'data.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  const next = JSON.stringify(data);
  if (prev === next) { console.log('[push-cloud] 无变化'); return; }
  fs.writeFileSync(outFile, next);

  // 凭证（gh keyring 里的 token）
  const token = execFileSync(GH, ['auth', 'token'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(require('node:os').tmpdir(), 'kanpan-gitcred'), `https://zengxiang21:${token}@github.com`);
  const g = (args) => execFileSync(GIT, args, { cwd: ROOT, encoding: 'utf8' });
  g(['add', 'docs/cloud/data.json']);
  g(['-c', 'user.name=kanpan', '-c', 'user.email=kanpan@local', 'commit', '-m', `cloud data ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`]);
  g(['-c', 'http.proxy=http://127.0.0.1:7897', '-c', 'credential.helper=', '-c', 'credential.helper=store --file=C:\Users\Administrator\AppData\Local\Temp/kanpan-gitcred', 'push']);
  fs.rmSync(path.join(require('node:os').tmpdir(), 'kanpan-gitcred'), { force: true });
  console.log('[push-cloud] 已推送云端快照', new Date().toLocaleTimeString('zh-CN', { hour12: false }));
}

main().catch((e) => { console.error('[push-cloud]', e.message); process.exit(1); });
