// 竞价雷达快照存档：9:25 定稿保存（含竞价涨幅），收盘后回填收盘涨幅与结果，供复盘验证
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'data', 'auction');

function fileOf(date) {
  return path.join(DIR, `${date}.json`);
}

export function saveAuctionSnapshot(date, payload) {
  try {
    if (!/^\d{8}$/.test(date)) return false;
    fs.mkdirSync(DIR, { recursive: true });
    const f = fileOf(date);
    if (fs.existsSync(f)) return false; // 每日定稿一次，不覆盖
    fs.writeFileSync(f, JSON.stringify(payload));
    console.log('[auction] 竞价快照已定稿', date, '·', payload.rows?.length, '只');
    return true;
  } catch (e) {
    console.error('[auction] 保存失败', e.message);
    return false;
  }
}

export function getAuctionByDate(date) {
  try {
    if (!/^\d{8}$/.test(date)) return null;
    return JSON.parse(fs.readFileSync(fileOf(date), 'utf8'));
  } catch {
    return null;
  }
}

export function listAuctionDates() {
  try {
    return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort().reverse();
  } catch {
    return [];
  }
}

// 收盘后回填：竞价涨幅 → 收盘涨幅 → 结果（竞价买入当日是否浮盈）
export function updateAuctionCloses(date, closeMap) {
  try {
    const f = fileOf(date);
    if (!fs.existsSync(f)) return;
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    let changed = false;
    for (const r of data.rows || []) {
      const close = closeMap.get(r.code);
      if (close != null && r.closePct == null) {
        r.closePct = +close.pct.toFixed(2);
        r.closeSealed = !!close.sealed;
        r.correct = r.gap != null ? +(r.closePct - r.gap).toFixed(2) : null; // >0 = 竞价买入当日浮盈
        changed = true;
      }
    }
    if (changed) {
      data.closedAt = Date.now();
      fs.writeFileSync(f, JSON.stringify(data));
      console.log('[auction] 收盘涨幅回填完成', date);
    }
  } catch (e) {
    console.error('[auction] 回填失败', e.message);
  }
}
