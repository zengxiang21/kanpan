// 补丁：知识库补充用户点名的雪球文章
import fs from 'node:fs';
const p = new URL('../web/src/components/KnowledgePage.jsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let s = fs.readFileSync(p, 'utf8');
if (s.includes('342279758')) { console.log('已存在'); process.exit(0); }
s = s.replace(
  "  ['情绪龙头战法：情绪周期的思考与操作节点（雪球）', 'https://xueqiu.com/k?q=%E6%83%85%E7%BB%AA%E5%91%A8%E6%9C%9F%20%E6%93%8D%E4%BD%9C%E8%8A%82%E7%82%B9', '周期阶段与节点操作'],",
  "  ['情绪龙头战法：情绪周期的思考与操作节点（雪球）', 'https://xueqiu.com/k?q=%E6%83%85%E7%BB%AA%E5%91%A8%E6%9C%9F%20%E6%93%8D%E4%BD%9C%E8%8A%82%E7%82%B9', '周期阶段与节点操作'],\n  ['长文 342279758（雪球 · 用户推荐）', 'https://xueqiu.com/1899529380/342279758', '实战长文 · 支持站内阅读'],"
);
fs.writeFileSync(p, s);
console.log('文章已加:', s.includes('342279758'));
