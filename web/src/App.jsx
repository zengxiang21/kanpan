import { useEffect, useState } from 'react';
import { connect } from './lib/stream.js';
import { fmtTime, PHASE_LABEL } from './lib/format.js';
import IndexStrip from './components/IndexStrip.jsx';
import EmotionPanel from './components/EmotionPanel.jsx';
import ZtPool from './components/ZtPool.jsx';
import Ranks from './components/Ranks.jsx';
import Watchlist from './components/Watchlist.jsx';
import PreMarket from './components/PreMarket.jsx';
import AuctionPage from './components/AuctionPage.jsx';
import ScanPage from './components/ScanPage.jsx';
import AnomalyPage from './components/AnomalyPage.jsx';
import KnowledgePage from './components/KnowledgePage.jsx';
import JournalPage from './components/JournalPage.jsx';
import StockDetail from './components/StockDetail.jsx';
import ReviewPage from './components/ReviewPage.jsx';
import SectorsPage from './components/SectorsPage.jsx';

const MENU = [
  {
    group: '盘前',
    items: [
      { key: 'premarket', label: '盘前决策', comp: PreMarket },
      { key: 'auction', label: '竞价雷达', comp: AuctionPage },
    ],
  },
  {
    group: '盘中',
    items: [
      { key: 'emotion', label: '情绪总览', comp: EmotionPanel },
      { key: 'sectors', label: '板块轮动', comp: SectorsPage },
      { key: 'ranks', label: '市场扫描', comp: (p) => <Ranks {...p} />, badge: 'ranks' },
      { key: 'ztpool', label: '涨停天梯', comp: ZtPool, badge: 'zt' },
      { key: 'scan', label: '形态选股', comp: ScanPage },
      { key: 'reflow', label: '龙头回流', comp: (p) => <ScanPage {...p} section="reflow" /> },
      { key: 'watch', label: '自选盯盘', comp: Watchlist },
      { key: 'anomaly', label: '异动监控', comp: AnomalyPage },
    ],
  },
  {
    group: '复盘与学习',
    items: [
      { key: 'review', label: '收盘复盘', comp: ReviewPage },
      { key: 'journal', label: '交易日志', comp: JournalPage },
      { key: 'knowledge', label: '超短知识库', comp: KnowledgePage },
    ],
  },
];

export default function App() {
  const [tick, setTick] = useState(null);
  const [pools, setPools] = useState({ zt: [], zb: [], dt: [], prevZt: [] });
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tradingDay, setTradingDay] = useState(null);
  const [live, setLive] = useState(false);
  const [tab, setTab] = useState('premarket');
  const [stock, setStock] = useState(null);
  const openStock = (code, name) => setStock({ code, name: name || code });
  const [collapsed, setCollapsed] = useState(false);
  const [watch, setWatch] = useState([]);

  useEffect(() => connect(
    (msg) => {
      if (!msg || !msg.type) return;
      if (msg.type === 'tick') {
        setTick(msg.payload);
        setUpdatedAt(msg.payload?.updatedAt ?? null);
        if (msg.payload?.tradingDay) setTradingDay(msg.payload.tradingDay);
      } else if (msg.type === 'pools') {
        setPools(msg.payload);
      } else if (msg.type === 'snapshot') {
        setTick(msg.tick);
        setPools(msg.pools || { zt: [], zb: [], dt: [], prevZt: [] });
        setUpdatedAt(msg.updatedAt ?? null);
        setTradingDay(msg.tradingDay ?? null);
      }
    },
    setLive
  ), []);

  const saveWatch = (next) => {
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
  }, []);

  const badgeOf = (key) => {
    if (key === 'zt') return tick?.ztCount || null;
    if (key === 'ranks') return null;
    return null;
  };

  const ActiveComp = MENU.flatMap((g) => g.items).find((i) => i.key === tab)?.comp;
  const showStrip = tab !== 'premarket';

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">K</span>
          {!collapsed && (
            <div>
              <div className="brand-name">短线看盘</div>
              <div className="brand-sub">超短 · 实时 · 免费</div>
            </div>
          )}
        </div>
        <nav className="menu">
          {MENU.map((g) => (
            <div className="menu-group" key={g.group}>
              {!collapsed && <div className="menu-title">{g.group}</div>}
              {g.items.map((it) => {
                const badge = badgeOf(it.key);
                return (
                  <button
                    key={it.key}
                    className={`menu-item ${tab === it.key ? 'active' : ''}`}
                    title={it.label}
                    onClick={() => { setTab(it.key); setStock(null); }}
                  >
                    <span className="menu-label">{it.label}</span>
                    {badge != null && !collapsed && <em>{badge}</em>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          {!collapsed && (
            <>
              <div className={`dot ${live ? 'on' : ''}`} />
              <span className="ts">{fmtTime(updatedAt)}</span>
              {tick && <span className="phase">{PHASE_LABEL[tick.phase] || tick.phase}</span>}
              {tradingDay && <span className="day">{tradingDay.slice(4, 6)}/{tradingDay.slice(6, 8)}</span>}
              {tick?.sourceFallback && <span className="fallback-badge" title="东财限频，已切新浪/腾讯备源">⚠备源</span>}
            </>
          )}
          <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '»' : '«'}</button>
        </div>
      </aside>

      <main className="content">
        {stock ? (
          <StockDetail code={stock.code} name={stock.name} onBack={() => setStock(null)} onWatch={addWatch} />
        ) : (
          <>
            {showStrip && <IndexStrip tick={tick} />}
            {ActiveComp && <ActiveComp tick={tick} pools={pools} onWatch={addWatch} watch={watch} onRemove={removeWatch} onOpenStock={openStock} />}
          </>
        )}
      </main>
    </div>
  );
}
