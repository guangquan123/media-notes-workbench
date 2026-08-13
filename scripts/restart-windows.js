#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
console.log('[restart-windows] 停止旧服务...');
spawnSync(process.execPath, [path.resolve(__dirname, 'stop.js')], { cwd: root, stdio: 'inherit' });
console.log('[restart-windows] 启动新服务...');
spawnSync(process.execPath, [path.resolve(__dirname, 'launch-windows.js')], { cwd: root, stdio: 'inherit' });
process.exit(0);
