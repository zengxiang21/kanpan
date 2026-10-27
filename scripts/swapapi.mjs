// 批量把页面 fetch('/api/X') 换成 api('X')，并注入 import
import fs from 'node:fs';
const dir = new URL('../web/src/components/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = ['ReviewPage.jsx', 'ScanPage.jsx', 'SectorsPage.jsx', 'AuctionPage.jsx'];
for (const f of files) {
  const p = dir + f;
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('lib/api.js')) {
    s = s.replace(/(import \{[^\n]*\} from '\.\.\/lib\/format\.js';)/, "$1\nimport { api, CLOUD } from '../lib/api.js';");
  }
  s = s.split("fetch('/api/review/dates')").join("api('reviewDates')");
  s = s.split("fetch('/api/plan?codes=' + codes)").join("api('plan?codes=' + codes)");
  s = s.split("await fetch('/api/scan')").join("await api('scan')");
  s = s.split("fetch('/api/backtest')").join("api('backtest')");
  s = s.split("await fetch('/api/sectors')").join("await api('sectors')");
  s = s.split("fetch('/api/auction/dates')").join("api('auctionDates')");
  s = s.split("fetch(viewDate ? '/api/auction?date=' + viewDate : '/api/auction')").join("api(viewDate ? 'auction?date=' + viewDate : 'auction')");
  s = s.split("fetch('/api/review')").join("api('review')");
  s = s.split("fetch('/api/review/bydate?date=' + viewDate)").join("api('review/bydate?date=' + viewDate)");
  fs.writeFileSync(p, s);
  console.log(f, 'api=' + s.includes('lib/api.js'));
}
