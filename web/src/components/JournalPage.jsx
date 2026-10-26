// 交易日志：手动记录买卖 + 胜率/盈亏统计（localStorage 本地存储）
import { useState } from 'react';
import { fmtPrice, fmtPct } from '../lib/format.js';

const KEY = 'kanpan-journal';

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export default function JournalPage() {
  const [entries, setEntries] = useState(loadEntries);
  const [form, setForm] = useState({ date: new Date().toLocaleDateString('sv-SE'), code: '', name: '', dir: '买', price: '', qty: '', result: '', note: '' });

  const save = (list) => {
    setEntries(list);
    localStorage.setItem(KEY, JSON.stringify(list));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.code || !form.price) return;
    save([{ ...form, id: Date.now(), price: +form.price, qty: +form.qty || 0 }, ...entries]);
    setForm({ ...form, code: '', name: '', price: '', qty: '', note: '' });
  };

  const remove = (id) => save(entries.filter((x) => x.id !== id));

  const wins = entries.filter((x) => x.result === '胜').length;
  const losses = entries.filter((x) => x.result === '负').length;
  const decided = wins + losses;

  return (
    <div className="page">
      <h2 className="page-title">交易日志 <span className="page-tag">本地存储 · 超短自检刚需</span></h2>

      <div className="cards" style={{ marginBottom: 12 }}>
        <div className="card"><div className="k">已记录</div><div className="v">{entries.length}<small>笔</small></div></div>
        <div className="card"><div className="k">胜率</div><div className="v">{decided ? Math.round((wins / decided) * 100) + '%' : '-'}</div><div className="note">{wins} 胜 {losses} 负</div></div>
        <div className="card"><div className="k">连续亏损提醒</div><div className="v">2<small>笔即减半仓</small></div><div className="note">纪律：连亏 2 笔当日停手复盘</div></div>
      </div>

      <form className="journal-form panel" onSubmit={submit} style={{ marginBottom: 12 }}>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input placeholder="代码" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={{ width: 90 }} />
        <input placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: 110 }} />
        <select value={form.dir} onChange={(e) => setForm({ ...form, dir: e.target.value })}>
          <option>买</option><option>卖</option>
        </select>
        <input placeholder="价格" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ width: 80 }} />
        <input placeholder="数量" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={{ width: 80 }} />
        <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
          <option value="">结果</option><option>胜</option><option>负</option>
        </select>
        <input placeholder="备注：买点类型/错误原因" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ flex: 1 }} />
        <button className="mini" type="submit">记录</button>
      </form>

      <table className="tbl">
        <thead>
          <tr><th>日期</th><th>代码</th><th>名称</th><th>方向</th><th>价格</th><th>数量</th><th>结果</th><th>备注</th><th></th></tr>
        </thead>
        <tbody>
          {entries.length === 0 && <tr><td colSpan={9} className="empty">还没有记录 —— 每笔交易记下买点类型和复盘结论，胜率自然提高</td></tr>}
          {entries.map((x) => (
            <tr key={x.id}>
              <td className="muted">{x.date}</td>
              <td>{x.code}</td>
              <td className="name">{x.name}</td>
              <td>{x.dir}</td>
              <td>{fmtPrice(x.price)}</td>
              <td>{x.qty || '-'}</td>
              <td>{x.result ? <span className={x.result === '胜' ? 'up bold' : 'down bold'}>{x.result}</span> : '-'}</td>
              <td className="muted">{x.note}</td>
              <td><button className="mini danger" onClick={() => remove(x.id)}>删</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
