// 用户数据存储：自选股/交易计划/交易日志（服务端 JSON，跨设备共享）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'user.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { watchlist: [], picks: [], journal: [] };
  }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error('[user] 保存失败', e.message);
  }
}

export function getUser() {
  const d = load();
  return {
    watchlist: Array.isArray(d.watchlist) ? d.watchlist : [],
    picks: Array.isArray(d.picks) ? d.picks : [],
    journal: Array.isArray(d.journal) ? d.journal : [],
  };
}

export function saveUser(patch) {
  const cur = load();
  const next = { ...cur };
  if (Array.isArray(patch.watchlist)) next.watchlist = patch.watchlist.slice(0, 100);
  if (Array.isArray(patch.picks)) next.picks = patch.picks.slice(0, 3);
  if (Array.isArray(patch.journal)) next.journal = patch.journal.slice(0, 500);
  save(next);
  return getUser();
}
