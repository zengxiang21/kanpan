// 补丁：用户数据服务端存储（自选/计划/日志跨设备共享）
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// --- userstore.js 已单独创建 ---

// index.js: /api/user 路由
{
  const p = root + 'server/src/index.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('/api/user')) {
    s = s.replace(
      "import { peersAnalysis } from './peers.js';",
      "import { peersAnalysis } from './peers.js';\nimport { getUser, saveUser } from './userstore.js';"
    );
    s = s.replace(
      "// 业绩预告（即将披露 + 近期已披露，含超预期判断）",
      `// 用户数据：自选/计划/日志（跨设备共享）
app.get('/api/user', (req, res) => res.json(getUser()));
app.post('/api/user', (req, res) => {
  try {
    res.json(saveUser(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 业绩预告（即将披露 + 近期已披露，含超预期判断）`
    );
    fs.writeFileSync(p, s);
    console.log('index.js /api/user OK');
  }
}

// --- App.jsx: watch 从服务端加载/保存（含 localStorage 迁移） ---
{
  const p = root + 'web/src/App.jsx';
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(
    `  const [watch, setWatch] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('watchlist') || '[]');
    } catch {
      return [];
    }
  });`,
    `  const [watch, setWatch] = useState([]);`
  );
  s = s.replace(
    `  const addWatch = (code, name) => {
    setWatch((prev) => {
      if (prev.some((x) => x.code === code)) return prev;
      const next = [...prev, { code, name }];
      localStorage.setItem('watchlist', JSON.stringify(next));
      return next;
    });
  };

  const removeWatch = (code) => {
    setWatch((prev) => {
      const next = prev.filter((x) => x.code !== code);
      localStorage.setItem('watchlist', JSON.stringify(next));
      return next;
    });
  };`,
    `  const saveWatch = (next) => {
    setWatch(next);
    fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watchlist: next }) }).catch(() => {});
  };

  const addWatch = (code, name) => {
    setWatch((prev) => {
      if (prev.some((x) => x.code === code)) return prev;
      const next = [...prev, { code, name }];
      fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watchlist: next }) }).catch(() => {});
      return next;
    });
  };

  const removeWatch = (code) => {
    setWatch((prev) => {
      const next = prev.filter((x) => x.code !== code);
      fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watchlist: next }) }).catch(() => {});
      return next;
    });
  };

  // 启动：服务端加载自选；服务端为空且本机 localStorage 有旧数据 → 迁移上传
  useEffect(() => {
    fetch('/api/user').then((r) => r.json()).then((u) => {
      if (Array.isArray(u.watchlist) && u.watchlist.length) {
        setWatch(u.watchlist);
      } else {
        try {
          const local = JSON.parse(localStorage.getItem('watchlist') || '[]');
          if (Array.isArray(local) && local.length) {
            setWatch(local);
            fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watchlist: local }) }).catch(() => {});
          }
        } catch { /* 忽略 */ }
      }
    }).catch(() => {});
  }, []);`
  );
  fs.writeFileSync(p, s);
  console.log('App.jsx watch 服务端化 OK');
}

// --- ReviewPage: picks 服务端化 ---
{
  const p = root + 'web/src/components/ReviewPage.jsx';
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(
    `  const [picked, setPicked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('plan-picks') || '[]');
    } catch {
      return [];
    }
  });`,
    `  const [picked, setPicked] = useState([]);`
  );
  s = s.replace(
    `  useEffect(() => {
    localStorage.setItem('plan-picks', JSON.stringify(picked));
    if (!codes) { setPlans([]); return; }`,
    `  useEffect(() => {
    if (picked.length) fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks: picked }) }).catch(() => {});
    if (!codes) { setPlans([]); return; }`
  );
  // 启动时从服务端加载 picks（挂到已有的 user fetch 上：单独 effect）
  s = s.replace(
    `  useEffect(() => {
    api('reviewDates').then((d) => Array.isArray(d) && setDates(d)).catch(() => {});
  }, []);`,
    `  useEffect(() => {
    api('reviewDates').then((d) => Array.isArray(d) && setDates(d)).catch(() => {});
    fetch('/api/user').then((r) => r.json()).then((u) => Array.isArray(u.picks) && u.picks.length && setPicked(u.picks)).catch(() => {});
  }, []);`
  );
  fs.writeFileSync(p, s);
  console.log('ReviewPage picks 服务端化 OK');
}
console.log('完成');
