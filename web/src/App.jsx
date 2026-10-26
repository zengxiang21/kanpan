import { useEffect, useState } from 'react';
import { connect } from './lib/stream.js';
import { fmtTime, PHASE_LABEL } from './lib/format.js';
import IndexStrip from './components/IndexStrip.jsx';
import EmotionPanel from './components/EmotionPanel.jsx';
import ZtPool from './components/ZtPool.jsx';
import Ranks from './components/Ranks.jsx';
import Watchlist from './components/Watchlist.jsx';

const TABS = [
  { key: 'emotion', label: '情绪总览' },
  { key: 'ztpool', label: '涨停池' },
  { key: 'ranks', label: '扫描榜' },
  { key: 'watch', label: '自选' },
];

export default function App() {
  const [tick, setTick] = useState(null);
  const [pools, setPools] = useState({ zt: [], zb: [], dt: [] });
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tradingDay, setTradingDay] = useState(null);
  const [live, setLive] = useState(false);
  const [tab, setTab] = useState('emotion');
  const [watch, setWatch] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('watchlist') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => connect(
    (msg) => {
      if (!msg || !msg.type) return;
      if (msg.type === 'tick') {
        setTick(msg.payload);
        setUpdatedAt(msg.payload?.updatedAt ?? null);
      } else if (msg.type === 'pools') {
        setPools(msg.payload);
      } else if (msg.type === 'snapshot') {
        setTick(msg.tick);
        setPools(msg.pools || { zt: [], zb: [], dt: [] });
        setUpdatedAt(msg.updatedAt ?? null);
        setTradingDay(msg.tradingDay ?? null);
      }
    },
    setLive
  ), []);

  const addWatch = (code, name) => {
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
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">短线看盘<span className="sub">kanpan</span></div>
        <div className="status">
          {tradingDay && <span className="day">交易日 {tradingDay.slice(4, 6)}/{tradingDay.slice(6, 8)}</span>}
          {tick?.sourceFallback && <span className="fallback-badge" title="东财接口被限频，已自动切换新浪/腾讯备源">⚠ 备用数据源</span>}
          {tick && <span className="phase">{PHASE_LABEL[tick.phase] || tick.phase}</span>}
          <span className={`dot ${live ? 'on' : ''}`} />
          <span className="ts">{fmtTime(updatedAt)}</span>
        </div>
      </header>

      <IndexStrip tick={tick} />

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'ztpool' && tick?.ztCount != null && <em>{tick.ztCount}</em>}
            {t.key === 'watch' && watch.length > 0 && <em>{watch.length}</em>}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'emotion' && <EmotionPanel tick={tick} pools={pools} />}
        {tab === 'ztpool' && <ZtPool tick={tick} pools={pools} onWatch={addWatch} />}
        {tab === 'ranks' && <Ranks tick={tick} onWatch={addWatch} />}
        {tab === 'watch' && <Watchlist watch={watch} onRemove={removeWatch} onAdd={addWatch} />}
      </main>
    </div>
  );
}
