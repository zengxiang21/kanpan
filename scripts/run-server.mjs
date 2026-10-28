// 看盘服务守护进程：子进程退出立即重启；配合服务内看门狗（数据停滞自尽）实现自愈
import { spawn } from 'node:child_process';

function start() {
  const p = spawn(process.execPath, ['server/src/index.js'], { stdio: 'inherit', env: { ...process.env, UV_THREADPOOL_SIZE: '64' } });
  const ts = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
  p.on('exit', (code) => {
    console.error(`[${ts()}] [supervisor] 服务退出(code=${code}) → 3 秒后重启`);
    setTimeout(start, 3000);
  });
  p.on('error', (e) => {
    console.error(`[${ts()}] [supervisor] spawn 失败: ${e.message} → 5 秒后重试`);
    setTimeout(start, 5000);
  });
}
console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] [supervisor] 启动`);
start();
