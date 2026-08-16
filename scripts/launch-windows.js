#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');
const { writeLauncherFailure } = require('./launcher-status.js');

const script = path.resolve(__dirname, 'dev-windows.js');
const root = path.resolve(__dirname, '..');
let child;

try {
  child = spawn(process.execPath, [script], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
} catch (error) {
  writeLauncherFailure({
    rootDir: root,
    stage: '创建启动进程失败',
    message: 'Windows 无法创建本地启动进程',
    detail: '新服务尚未开始启动，页面不会将本次操作误判为成功。',
    suggestion:
      '请检查安全软件或进程权限设置后重新尝试，并查看诊断日志了解详情。',
  });
  throw error;
}

child.once('error', () => {
  writeLauncherFailure({
    rootDir: root,
    stage: '创建启动进程失败',
    message: 'Windows 无法创建本地启动进程',
    detail: '新服务尚未开始启动，页面不会将本次操作误判为成功。',
    suggestion:
      '请检查安全软件或进程权限设置后重新尝试，并查看诊断日志了解详情。',
  });
});
child.unref();
console.log('[launch-windows] 已后台启动 Windows 开发服务，PID', child.pid);
console.log('[launch-windows] 请稍后访问项目地址，日志 logs/dev.std.log');
process.exit(0);
