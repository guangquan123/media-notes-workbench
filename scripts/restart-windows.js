#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { writeLauncherFailure } = require('./launcher-status.js');

const root = path.resolve(__dirname, '..');

function failRestart(stage, message, detail, suggestion) {
  console.error('[restart-windows] ' + message);
  writeLauncherFailure({
    rootDir: root,
    stage,
    message,
    detail,
    suggestion,
  });
  process.exit(1);
}

console.log('[restart-windows] 停止旧服务...');
const stopResult = spawnSync(
  process.execPath,
  [path.resolve(__dirname, 'stop.js')],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: process.platform === 'win32',
  },
);
if (stopResult.error || stopResult.status !== 0) {
  failRestart(
    '停止旧服务失败',
    '旧服务未能完全停止，已取消本次重启',
    '为了避免旧进程和新进程同时存在、导致端口或启动状态误判，系统没有启动新的服务实例。',
    '请点击“查看诊断日志”确认停止失败原因；若显示访问被拒绝，请使用与原服务相同的 Windows 账户重新尝试。',
  );
}
console.log('[restart-windows] 启动新服务...');
const launchResult = spawnSync(
  process.execPath,
  [path.resolve(__dirname, 'launch-windows.js')],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: process.platform === 'win32',
  },
);
if (launchResult.error || launchResult.status !== 0) {
  failRestart(
    '创建新服务失败',
    '无法创建新的本地启动进程',
    '旧服务已停止，但新的启动进程未能建立，因此不会把重启误报为成功。',
    '请点击“查看诊断日志”查看具体原因后重试。',
  );
}
process.exit(0);
