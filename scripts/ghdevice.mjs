// GitHub 设备码授权（全程走 api.github.com，绕开被墙的 github.com 主站）
// 步骤1：请求设备码并打印给用户；步骤2：轮询令牌，成功后写入 data/.ghtoken
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', 'data', '.ghtoken');
const CLIENT_ID = '178c6fc778ccc68e1d6a'; // GitHub CLI 官方 OAuth App 的公开 client_id
const API = 'https://api.github.com';

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'kanpan' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return r.json();
}

const dc = await post(`${API}/login/device/code`, { client_id: CLIENT_ID, scope: 'repo' });
if (!dc.device_code) {
  console.error('设备码请求失败:', JSON.stringify(dc));
  process.exit(1);
}
console.log('USER_CODE=' + dc.user_code);
console.log('VERIF_URI=' + dc.verification_uri);
console.log('EXPIRES=' + dc.expires_in + 's');

// 轮询令牌
const interval = (dc.interval || 5) * 1000;
const deadline = Date.now() + dc.expires_in * 1000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, interval));
  const at = await post(`${API}/login/oauth/access_token`, {
    client_id: CLIENT_ID,
    device_code: dc.device_code,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });
  if (at.access_token) {
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_FILE, at.access_token);
    console.log('TOKEN_OK 已写入 ' + TOKEN_FILE);
    process.exit(0);
  }
  if (at.error === 'authorization_pending') {
    console.log('...等待用户在手机/浏览器完成授权');
    continue;
  }
  if (at.error === 'slow_down') {
    await new Promise((r) => setTimeout(r, 5000));
    continue;
  }
  console.error('授权失败:', at.error || JSON.stringify(at));
  process.exit(1);
}
console.error('授权超时');
process.exit(1);
