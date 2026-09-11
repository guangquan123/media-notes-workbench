#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const appRoot = path.resolve(
  process.env.WORKBENCH_APP_ROOT || path.resolve(__dirname, '..'),
);
const dataRoot = path.resolve(
  process.env.WORKBENCH_DATA_DIR ||
    path.join(process.env.LOCALAPPDATA || appRoot, 'MediaNotesWorkbench'),
);
const configDir = path.join(dataRoot, 'config');
const stateDir = path.join(dataRoot, 'runtime-state');
const logDir = path.join(dataRoot, 'logs');
const runtimeNode = path.join(appRoot, 'runtime', 'node.exe');
const serverScript = path.join(appRoot, 'scripts', 'dev-windows.js');
const clientHost = process.env.CLIENT_DEV_HOST || '127.0.0.1';
const clientPort = Number(process.env.CLIENT_DEV_PORT || 8081);
const clientBasePath =
  `${process.env.CLIENT_BASE_PATH || '/'}`.replace(/\/+$/u, '') || '';
const appUrl = `http://${clientHost}:${clientPort}${clientBasePath}/`;

function ensureDirectories() {
  for (const directory of [dataRoot, configDir, stateDir, logDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function request(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const requestHandle = http.get(url, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode || 0));
    });
    requestHandle.setTimeout(timeoutMs, () => requestHandle.destroy());
    requestHandle.once('error', () => resolve(0));
  });
}

async function waitForReady(timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  const runtimeUrl = `${appUrl}api/runtime`;
  while (Date.now() < deadline) {
    const [pageStatus, runtimeStatus] = await Promise.all([
      request(appUrl),
      request(runtimeUrl),
    ]);
    if (pageStatus >= 200 && pageStatus < 400 && runtimeStatus === 200) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function openBrowser() {
  if (process.platform !== 'win32' || process.env.WORKBENCH_NO_BROWSER === '1') {
    return;
  }
  const browser = spawn('explorer.exe', [appUrl], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  browser.unref();
}

async function main() {
  if (process.platform === 'win32' && !fs.existsSync(runtimeNode)) {
    throw new Error(`安装包缺少内置运行时: ${runtimeNode}`);
  }
  if (!fs.existsSync(serverScript)) {
    throw new Error(`安装包缺少启动脚本: ${serverScript}`);
  }
  ensureDirectories();

  const child = spawn(runtimeNode, [serverScript, '--skip-build'], {
    cwd: appRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      CLIENT_DEV_HOST: clientHost,
      CLIENT_DEV_PORT: String(clientPort),
      CLIENT_BASE_PATH: clientBasePath,
      LOG_DIR: logDir,
      NODE_ENV: 'production',
      SERVER_HOST: process.env.SERVER_HOST || '127.0.0.1',
      SERVER_PORT: process.env.SERVER_PORT || '3000',
      WORKBENCH_APP_ROOT: appRoot,
      WORKBENCH_CONFIG_DIR: configDir,
      WORKBENCH_DATA_DIR: dataRoot,
      WORKBENCH_INSTALLED: '1',
      WORKBENCH_STATE_DIR: stateDir,
    },
  });
  child.unref();

  const ready = await waitForReady();
  if (!ready) {
    throw new Error(`工作台启动超时，请查看日志: ${path.join(logDir, 'dev.std.log')}`);
  }
  openBrowser();
}

main().catch((error) => {
  process.stderr.write(
    `[installed-launcher] ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
