// 新浪行业成分映射：给每只票打"方向"标签（每日构建一次，原子落盘）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchGBK } from './em.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'industrymap.json');
const H = { Referer: 'https://finance.sina.com.cn/' };

export const industryState = {
  map: {},          // code -> 行业名（细类）
  updatedAt: null,
  building: false,
};

export function loadIndustryMap() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    industryState.map = raw.map || {};
    industryState.updatedAt = raw.updatedAt || null;
    console.log('[industry] 行业映射载入', Object.keys(industryState.map).length, '只');
  } catch {
    console.log('[industry] 无映射文件，待构建');
  }
}

function saveIndustryMap() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ updatedAt: industryState.updatedAt, map: industryState.map }));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error('[industry] 落盘失败', e.message);
  }
}

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

// 行业细类节点列表（hangye_ZAxx → 名称）
async function getNodes() {
  const txt = await fetchGBK('https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=new_blhy', H, 9000);
  const json = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1);
  const obj = JSON.parse(json);
  return Object.values(obj).map((raw) => {
    const f = String(raw).split(',');
    return { node: f[0], name: f[1], count: parseInt(f[2], 10) || 0 };
  }).filter((x) => x.node && x.name);
}

// 单行业成分股（分页拉全）
async function getIndustryStocks(node, pages) {
  const codes = [];
  for (let p = 1; p <= pages; p++) {
    const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData` +
      `?page=${p}&num=80&sort=amount&asc=0&node=${node}&symbol=&_s_r_a=page`;
    try {
      const arr = JSON.parse(await fetchGBK(url, H, 9000));
      if (!Array.isArray(arr) || !arr.length) break;
      for (const x of arr) codes.push({ code: x.code, name: x.name });
      if (arr.length < 80) break;
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      break;
    }
  }
  return codes;
}

let started = false;
export function ensureIndustryMapStarted() {
  if (started) return;
  started = true;
  (async () => {
    // 当天已构建则跳过
    if (industryState.updatedAt === todayStr() && Object.keys(industryState.map).length > 1000) return;
    industryState.building = true;
    try {
      const nodes = await getNodes();
      console.log('[industry] 构建', nodes.length, '个行业细类成分…');
      const map = { ...industryState.map };
      for (const n of nodes) {
        const pages = Math.min(6, Math.ceil((n.count || 80) / 80));
        const stocks = await getIndustryStocks(n.node, pages);
        for (const s of stocks) map[s.code] = n.name;
      }
      industryState.map = map;
      industryState.updatedAt = todayStr();
      saveIndustryMap();
      console.log('[industry] 完成 · 覆盖', Object.keys(map).length, '只');
    } catch (e) {
      console.error('[industry] 构建失败', e.message);
    } finally {
      industryState.building = false;
    }
  })();
}

export function industryOf(code) {
  return industryState.map[String(code)] || null;
}
