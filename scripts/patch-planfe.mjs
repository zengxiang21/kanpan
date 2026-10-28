// 补丁：ReviewPage 交易计划改为自动推荐 + 手动可切换
import fs from 'node:fs';
const p = new URL('../web/src/components/ReviewPage.jsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let s = fs.readFileSync(p, 'utf8');

// 1) 加载逻辑：自动模式拉 /api/plan（无 codes）；手动模式拉 codes
s = s.replace(
  "  const [viewDate, setViewDate] = useState('');",
  "  const [viewDate, setViewDate] = useState('');\n  const [planMode, setPlanMode] = useState('auto'); // auto=系统推荐 manual=自选票"
);
s = s.replace(
  "  const codes = picked.join(',');\n  useEffect(() => {\n    if (picked.length) fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks: picked }) }).catch(() => {});\n    if (!codes) { setPlans([]); return; }\n    api('plan?codes=' + codes).then((d) => Array.isArray(d) && setPlans(d)).catch(() => {});\n  }, [codes]);",
  `  const codes = picked.join(',');
  useEffect(() => {
    if (picked.length) fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks: picked }) }).catch(() => {});
  }, [codes]);
  useEffect(() => {
    if (planMode === 'manual' && !codes) { setPlans([]); return; }
    const url = planMode === 'manual' ? 'plan?codes=' + codes : 'plan';
    api(url).then((d) => d && Array.isArray(d.plans) && setPlans(d.plans)).catch(() => {});
  }, [planMode, codes]);`
);

// 2) 计划卡标题加来源徽章
s = s.replace(
  "function PlanCard({ plan, onOpenStock }) {\n  return (",
  "function PlanCard({ plan, onOpenStock }) {\n  return ("
);
s = s.replace(
  '          <b>{plan.name}</b><small>{plan.code}</small>',
  '          <b>{plan.name}</b><small>{plan.code}</small>\n          {plan.from && <span className="lb lb-high">{plan.from}</span>}'
);

// 3) 选择区：自动/手动切换
s = s.replace(
  `      <div className="panel">
        <h3>交易计划 · 关注股作战卡（最多 3 只 · 9:15 竞价后照表执行）</h3>
        <div className="plan-picker">`,
  `      <div className="panel">
        <h3>
          交易计划 · 关注股作战卡（最多 3 只 · 9:15 竞价后照表执行）
          <button className={\`mini \${planMode === 'auto' ? 'active-mini' : ''}\`} onClick={() => { setPlanMode('auto'); setPicked([]); }}>🎯 系统推荐</button>
          <button className={\`mini \${planMode === 'manual' ? 'active-mini' : ''}\`} onClick={() => setPlanMode('manual')}>从自选挑</button>
        </h3>
        <div className="plan-picker">`
);
s = s.replace(
  `        <div className="hint" style={{ margin: '6px 0 10px' }}>
          选票思路不必选最强的：情绪【{review?.emotion?.cycleStage || '…'}】阶段，主线题材的低位首板是确定性较高的<span className="up">套利板</span>；
          龙头适合低吸/锁仓，跟风只做弱转强。每张卡按"竞价情景 → 检查点 → 止损止盈"执行。
        </div>
        <div className="row2" style={{ marginTop: 10 }}>
          {plans.map((p) => <PlanCard key={p.code} plan={p} onOpenStock={onOpenStock} />)}
          {picked.length === 0 && <div className="empty">从自选股点选或输入代码（≤3 只），生成"竞价情景 + 检查点 + 止损止盈"作战卡</div>}
        </div>`,
  `        <div className="hint" style={{ margin: '6px 0 10px' }}>
          选票思路不必选最强的：情绪【{review?.emotion?.cycleStage || '…'}】阶段，主线题材的低位首板是确定性较高的<span className="up">套利板</span>；
          龙头适合低吸/锁仓，跟风只做弱转强。每张卡按"竞价情景 → 检查点 → 止损止盈"执行。
          {planMode === 'auto' ? ' 系统推荐优先级：空间板龙头 → 回流预期 → 底部放量 → 缩量回踩。' : ''}
        </div>
        <div className="row2" style={{ marginTop: 10 }}>
          {plans.map((p) => <PlanCard key={p.code} plan={p} onOpenStock={onOpenStock} />)}
          {plans.length === 0 && (
            <div className="empty">
              {planMode === 'auto'
                ? '系统推荐生成中…（来源：空间板龙头 / 回流预期 / 底部放量 / 缩量回踩，自动去重取 3 只）'
                : '从自选股点选或输入代码（≤3 只），生成"竞价情景 + 检查点 + 止损止盈"作战卡'}
            </div>
          )}
        </div>`
);
fs.writeFileSync(p, s);
console.log('ReviewPage 自动推荐 OK');
