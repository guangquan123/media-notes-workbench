#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  findAvailablePort,
  readLauncherEndpoint,
  writeLauncherEndpoint,
} = require('./launcher-endpoint.js');
const { writeLauncherFailure } = require('./launcher-status.js');

const appRoot = path.resolve(
  process.env.WORKBENCH_APP_ROOT || path.resolve(__dirname, '..'),
);
process.env.WORKBENCH_APP_ROOT = appRoot;
process.env.WORKBENCH_INSTALLED = '1';
if (!process.env.WORKBENCH_HOME) {
  process.env.WORKBENCH_HOME = path.join(
    process.env.LOCALAPPDATA || appRoot,
    'MediaNotesWorkbench',
  );
}
const { applyRuntimePathEnvironment } = require('./runtime-paths.js');
const { applyBundledToolPath } = require('./runtime-tools.js');
const runtimePaths = applyRuntimePathEnvironment(process.env, {
  cwd: appRoot,
});
applyBundledToolPath(process.env, appRoot);
const dataRoot = runtimePaths.dataDir;
const configDir = runtimePaths.configDir;
const stateDir = runtimePaths.stateDir;
const logDir = runtimePaths.logDir;
const cacheDir = runtimePaths.cacheDir;
const runtimeNode = path.join(appRoot, 'runtime', 'node.exe');
const serverScript = path.join(appRoot, 'scripts', 'dev-windows.js');
const launcherRecoveryPath = path.join(stateDir, 'launcher-recovery.json');
const clientHost = process.env.CLIENT_DEV_HOST || '127.0.0.1';
const preferredClientPort = Number(process.env.CLIENT_DEV_PORT || 8081);
const preferredClientBasePath =
  `${process.env.CLIENT_BASE_PATH || '/'}`.replace(/\/+$/u, '') || '';
let clientPort = preferredClientPort;
let clientBasePath = preferredClientBasePath;
let appUrl = `http://${clientHost}:${clientPort}${clientBasePath}/`;

function ensureDirectories() {
  for (const directory of [dataRoot, configDir, cacheDir, stateDir, logDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function request(url, timeoutMs = 1500, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(0);
      return;
    }
    const requestHandle = http.get(url, { signal }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode || 0));
    });
    requestHandle.setTimeout(timeoutMs, () => requestHandle.destroy());
    requestHandle.once('error', () => resolve(0));
  });
}

async function waitForReady(timeoutMs = 300000, signal) {
  const deadline = Date.now() + timeoutMs;
  const runtimeUrl = `${appUrl}api/runtime`;
  while (Date.now() < deadline && !signal?.aborted) {
    const [pageStatus, runtimeStatus] = await Promise.all([
      request(appUrl, 1500, signal),
      request(runtimeUrl, 1500, signal),
    ]);
    if (pageStatus >= 200 && pageStatus < 400 && runtimeStatus === 200) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function openBrowser() {
  if (
    process.platform !== 'win32' ||
    process.env.WORKBENCH_NO_BROWSER === '1' ||
    process.env.WORKBENCH_LAUNCHER_UI === '1'
  ) {
    return;
  }
  const browser = spawn('explorer.exe', [appUrl], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  browser.unref();
}

function setClientEndpoint(endpoint) {
  clientPort = Number(endpoint.clientPort);
  clientBasePath =
    `${endpoint.clientBasePath || '/'}`.replace(/\/+$/u, '') || '';
  appUrl = `http://${clientHost}:${clientPort}${clientBasePath}/`;
}

async function reuseRunningWorkbench() {
  const rememberedEndpoint = readLauncherEndpoint(stateDir);
  const endpoints = [
    rememberedEndpoint,
    {
      clientHost,
      clientPort: preferredClientPort,
      clientBasePath: preferredClientBasePath,
    },
  ].filter(
    (endpoint, index, all) =>
      endpoint &&
      endpoint.clientHost === clientHost &&
      all.findIndex(
        (candidate) =>
          candidate &&
          candidate.clientHost === endpoint.clientHost &&
          candidate.clientPort === endpoint.clientPort &&
          candidate.clientBasePath === endpoint.clientBasePath,
      ) === index,
  );

  for (const endpoint of endpoints) {
    setClientEndpoint(endpoint);
    if (await waitForReady(2500)) return true;
  }
  return false;
}

async function selectClientEndpoint() {
  const selectedPort = await findAvailablePort({
    host: clientHost,
    preferredPort: preferredClientPort,
  });
  const endpoint = writeLauncherEndpoint(stateDir, {
    clientHost,
    clientPort: selectedPort,
    clientBasePath: preferredClientBasePath,
  });
  setClientEndpoint(endpoint);
  return endpoint;
}

function acknowledgeReadyService() {
  // The visible Windows launcher creates a unique operation token before it
  // starts this process. When an already-running service is reused, it still
  // needs the matching acknowledgement; otherwise the launcher UI can keep
  // waiting even though the workbench is already usable.
  try {
    const operationToken = fs
      .readFileSync(path.join(stateDir, 'launcher-operation.token'), 'utf8')
      .trim();
    if (operationToken) {
      fs.writeFileSync(
        path.join(stateDir, 'launcher-ready.token'),
        operationToken,
        'utf8',
      );
    }
  } catch {
    // Direct command-line launches do not have an operation token. The
    // running service itself remains the source of truth in that case.
  }
}

function writeLauncherRecoveryState(active, attempt = 0) {
  try {
    const operationToken = fs
      .readFileSync(path.join(stateDir, 'launcher-operation.token'), 'utf8')
      .trim();
    if (!operationToken) return false;
    const temporaryPath = `${launcherRecoveryPath}.${process.pid}.tmp`;
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify({
        active,
        attempt,
        maxAttempts: 3,
        operationToken,
        timestamp: Date.now(),
      }),
      'utf8',
    );
    fs.rmSync(launcherRecoveryPath, { force: true });
    fs.renameSync(temporaryPath, launcherRecoveryPath);
    return true;
  } catch {
    return false;
  }
}

function clearLauncherRecoveryState() {
  try {
    fs.rmSync(launcherRecoveryPath, { force: true });
  } catch {
    // The visual launcher treats a missing recovery marker as a normal start.
  }
}

function launchWorkbenchService() {
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
      WORKBENCH_CACHE_DIR: cacheDir,
      WORKBENCH_CONFIG_DIR: configDir,
      WORKBENCH_DATA_DIR: dataRoot,
      WORKBENCH_HOME: runtimePaths.homeDir,
      WORKBENCH_INSTALLED: '1',
      WORKBENCH_STATE_DIR: stateDir,
    },
  });
  child.unref();
  return new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ exit: { code, signal } }));
  });
}

function describeServiceExit(exit) {
  return exit.signal ? `信号 ${exit.signal}` : `退出码 ${exit.code ?? '未知'}`;
}

async function waitForLaunchedService() {
  const maxAttempts = 3;
  let latestExit;
  const recoveryStateVisible = writeLauncherRecoveryState(true);
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (recoveryStateVisible) writeLauncherRecoveryState(true, attempt);
      const childOutcome = launchWorkbenchService();
      const readinessController = new AbortController();
      const readyOrFailure = await Promise.race([
        waitForReady(300000, readinessController.signal).then((ready) => ({
          ready,
        })),
        childOutcome,
      ]);
      readinessController.abort();
      if (readyOrFailure.error) throw readyOrFailure.error;
      if (readyOrFailure.ready) {
        clearLauncherRecoveryState();
        return;
      }
      if (!readyOrFailure.exit) {
        throw new Error(
          `工作台启动超时，请查看日志: ${path.join(logDir, 'dev.std.log')}`,
        );
      }

      const readyAfterExit = await waitForReady(5000);
      if (readyAfterExit) {
        clearLauncherRecoveryState();
        return;
      }
      latestExit = readyOrFailure.exit;
      if (attempt === maxAttempts) break;

      const retryDelayMs = attempt * 1500;
      process.stderr.write(
        `[installed-launcher] 服务在就绪前退出（${describeServiceExit(latestExit)}），${retryDelayMs / 1000} 秒后自动恢复（${attempt + 1}/${maxAttempts}）。\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  } catch (error) {
    if (recoveryStateVisible) writeLauncherRecoveryState(false, maxAttempts);
    throw error;
  }
  if (recoveryStateVisible) writeLauncherRecoveryState(false, maxAttempts);
  throw new Error(
    `服务进程在工作台就绪前退出（${describeServiceExit(latestExit)}），已自动重试 3 次仍未恢复，请查看日志: ${path.join(logDir, 'dev.std.log')}`,
  );
}

async function main() {
  if (process.platform === 'win32' && !fs.existsSync(runtimeNode)) {
    throw new Error(`安装包缺少内置运行时: ${runtimeNode}`);
  }
  if (!fs.existsSync(serverScript)) {
    throw new Error(`安装包缺少启动脚本: ${serverScript}`);
  }
  ensureDirectories();

  // A customer can click the desktop icon again while the first window is
  // still open. Reuse a verified local workbench instead of spawning a second
  // static server on the same port, which previously made the second launch
  // fail with EADDRINUSE and look like the application was stuck.
  if (await reuseRunningWorkbench()) {
    acknowledgeReadyService();
    openBrowser();
    return;
  }

  // A development server or another local program can legitimately use the
  // default port. The installed product owns neither process, so safely use
  // the next free loopback port and publish it for the visible launcher.
  await selectClientEndpoint();

  await waitForLaunchedService();
  openBrowser();
}

main().catch((error) => {
  const detail =
    error instanceof Error ? error.stack || error.message : String(error);
  writeLauncherFailure({
    rootDir: appRoot,
    stage: '启动器初始化',
    message: '本地启动器未能启动服务',
    detail,
    suggestion: '请查看启动日志；若安装文件不完整，请重新安装后再试。',
  });
  process.stderr.write(`[installed-launcher] ${detail}\n`);
  process.exitCode = 1;
});
