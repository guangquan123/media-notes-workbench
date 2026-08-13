#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');

const script = path.resolve(__dirname, 'dev-local.js');
const child = spawn(process.execPath, [script], {
  cwd: path.resolve(__dirname, '..'),
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();
console.log('[launch-windows] 已后台启动本地开发服务，PID', child.pid);
console.log('[launch-windows] 访问 http://localhost:3000 ，日志 logs/dev.std.log');
process.exit(0);
