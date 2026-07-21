#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const pidPath = path.resolve(process.cwd(), 'pids/dev-local.pid');

if (!fs.existsSync(pidPath)) {
  console.log('[stop] 未发现本项目正在运行的本地开发进程。');
  process.exit(0);
}

const rawPid = fs.readFileSync(pidPath, 'utf8').trim();
const pid = Number.parseInt(rawPid, 10);
if (!Number.isInteger(pid) || pid <= 0) {
  fs.unlinkSync(pidPath);
  console.log('[stop] 已清理无效 PID 文件。');
  process.exit(0);
}

try {
  process.kill(pid, 0);
} catch {
  fs.unlinkSync(pidPath);
  console.log('[stop] 开发进程已停止，已清理过期 PID 文件。');
  process.exit(0);
}

try {
  process.kill(pid, 'SIGTERM');
  console.log(`[stop] 已向本项目开发进程 ${pid} 发送停止信号。`);
} catch (error) {
  const message = error instanceof Error ? error.message : '未知错误';
  console.error(`[stop] 停止失败: ${message}`);
  process.exit(1);
}
