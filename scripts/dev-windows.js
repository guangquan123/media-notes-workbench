#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const skipBuild = process.argv.includes('--skip-build');
// Windows 上 Vite 的 CommonJS 依赖预处理依赖 esbuild 子进程；当系统策略
// 拒绝创建该子进程时，关闭预处理会让 react/dayjs 以错误的 ESM 形式返回。
// 稳定启动默认直接使用已构建的静态资源，--vite-client 仅用于调试 HMR。
const useStaticClient =
  process.platform === 'win32' && !process.argv.includes('--vite-client');
process.chdir(rootDir);

const logDir = path.resolve(rootDir, process.env.LOG_DIR || 'logs');
const pidDir = path.resolve(rootDir, 'pids');
const pidPath = path.join(pidDir, 'dev-local.pid');
const launcherOperationTokenPath = path.join(
  pidDir,
  'launcher-operation.token',
);
const launcherReadyTokenPath = path.join(pidDir, 'launcher-ready.token');
const launcherUiReadyTokenPath = path.join(pidDir, 'launcher-ui-ready.token');
const launcherFailurePath = path.join(pidDir, 'launcher-failure.json');
const logPath = path.join(logDir, 'dev.std.log');

fs.mkdirSync(logDir, { recursive: true });
fs.mkdirSync(pidDir, { recursive: true });

function readLauncherOperationToken() {
  try {
    return fs.readFileSync(launcherOperationTokenPath, 'utf8').trim();
  } catch {
    return '';
  }
}

require('dotenv').config({ path: path.join(rootDir, '.env.local') });
require('dotenv').config({ path: path.join(rootDir, '.env') });

const wingetLinks = path.join(
  process.env.LOCALAPPDATA || '',
  'Microsoft',
  'WinGet',
  'Links',
);
if (process.env.LOCALAPPDATA && fs.existsSync(wingetLinks)) {
  const pathEntries = (process.env.PATH || '').split(path.delimiter);
  if (
    !pathEntries.some(
      (entry) => entry.toLowerCase() === wingetLinks.toLowerCase(),
    )
  ) {
    process.env.PATH = [wingetLinks, ...pathEntries].join(path.delimiter);
  }
}

process.env.MIAODA_APP_TYPE ||= '3';
process.env.MIAODA_LOCAL_DEV = '1';
process.env.VITE_RUNTIME = 'local';

const serverHost = process.env.SERVER_HOST || '127.0.0.1';
const serverPort = parsePort(process.env.SERVER_PORT, 3000, 'SERVER_PORT');
const clientHost = process.env.CLIENT_DEV_HOST || '127.0.0.1';
const clientPort = parsePort(
  process.env.CLIENT_DEV_PORT,
  8081,
  'CLIENT_DEV_PORT',
);
const clientBasePath =
  `${process.env.CLIENT_BASE_PATH || '/'}`.replace(/\/+$/, '') || '';
const appUrl = `http://${clientHost}:${clientPort}${clientBasePath}/`;

const nestCliPath = path.join(
  rootDir,
  'node_modules',
  '@nestjs',
  'cli',
  'bin',
  'nest.js',
);
const viteCliPath = path.join(
  rootDir,
  'node_modules',
  'vite',
  'bin',
  'vite.js',
);
const serverEntryPath = path.join(rootDir, 'dist', 'server', 'main.js');
const clientIndexPath = path.join(rootDir, 'dist', 'client', 'index.html');
const clientOutputPath = path.join(rootDir, 'dist', 'client');
const staticClientPath = path.join(rootDir, 'scripts', 'static-client.js');
const {
  inspectApplicationReadiness,
  isBackendServiceReady,
} = require('./application-readiness.js');
const { ensureLocalRuntimeConfig } = require('./local-runtime-config.js');
const {
  inspectWindowsLauncherProcess,
  resolveExistingLauncherState,
} = require('./launcher-process.js');
const {
  writeLauncherFailure: writeStandaloneLauncherFailure,
} = require('./launcher-status.js');

const fileRetryState = new Int32Array(new SharedArrayBuffer(4));

function isRetryableWindowsFileError(error) {
  return ['EBUSY', 'EPERM', 'EACCES'].includes(error?.code);
}

function runFileOperationWithRetry(operation, attempts = 8, delayMs = 100) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableWindowsFileError(error) || attempt === attempts) {
        throw error;
      }
      Atomics.wait(fileRetryState, 0, 0, delayMs);
    }
  }
  throw lastError;
}

function clearStalePidFile() {
  runFileOperationWithRetry(() => fs.unlinkSync(pidPath));
}

function claimPidFile() {
  try {
    const fd = fs.openSync(pidPath, 'wx');
    try {
      fs.writeSync(fd, String(process.pid), 0, 'utf8');
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return false;
  }
}

async function probeExistingService() {
  // Probe the same origin and mounted path that the browser uses. A direct
  // backend 200 is insufficient when the frontend proxy or app base path is
  // misconfigured and would otherwise let the launcher report a false success.
  const runtimeUrl = `${appUrl}api/runtime`;
  const readinessUrl = `${appUrl}api/note-jobs/readiness`;
  try {
    const inspection = await inspectApplicationReadiness({
      pageUrl: appUrl,
      readinessUrl,
      runtimeUrl,
      request: (target) =>
        requestHttp(target, target === readinessUrl ? 12000 : 2500),
    });
    return inspection.ready ? 'ready' : 'unavailable';
  } catch {
    return 'unknown';
  }
}

async function ensureNoExistingLauncher() {
  if (!fs.existsSync(pidPath)) return null;
  const existingPid = Number.parseInt(
    fs.readFileSync(pidPath, 'utf8').trim(),
    10,
  );
  if (!Number.isInteger(existingPid) || existingPid <= 0) {
    clearStalePidFile();
    return null;
  }

  let alive = false;
  try {
    process.kill(existingPid, 0);
    alive = true;
  } catch (error) {
    // Windows 下对非子进程调用 process.kill(pid, 0) 可能抛 EPERM，
    // 此时进程实际存在（只是无探测权限），不能当"不存在"处理。
    alive = Boolean(error && error.code === 'EPERM');
  }

  if (!alive) {
    clearStalePidFile();
    return null;
  }

  let ownership = 'unknown';
  if (process.platform === 'win32') {
    ({ ownership } = inspectWindowsLauncherProcess(existingPid, {
      rootDir,
      spawnSync,
    }));
  }

  let pidFileAgeMs = Number.POSITIVE_INFINITY;
  try {
    pidFileAgeMs = Math.max(0, Date.now() - fs.statSync(pidPath).mtimeMs);
  } catch {
    return null;
  }
  const serviceState = await probeExistingService();
  const state = resolveExistingLauncherState({
    ownership,
    pidFileAgeMs,
    serviceState,
  });

  if (state === 'stale') {
    clearStalePidFile();
    process.stdout.write(
      `[dev-windows] PID ${existingPid} 未对应可用的本项目服务，已清理过期状态并继续启动。\n`,
    );
    return null;
  }

  return { pid: existingPid, state };
}

function exitForExistingLauncher(existingLauncher) {
  if (existingLauncher.state === 'reuse-ready') {
    writeLauncherReadyToken();
    process.stdout.write(
      `[dev-windows] 已验证项目服务可用（启动器 PID ${existingLauncher.pid}），已接管当前启动窗口。\n`,
    );
    process.exit(0);
  }
  if (existingLauncher.state === 'reuse-starting') {
    process.stdout.write(
      `[dev-windows] 项目正在启动（PID ${existingLauncher.pid}），等待原启动进程完成就绪验证。\n`,
    );
    process.exit(0);
  }

  writeStandaloneLauncherFailure({
    rootDir,
    stage: '检查已有实例',
    message: '无法确认已有启动进程是否健康',
    detail: `PID ${existingLauncher.pid} 仍存在，但本地页面和核心 API 未通过完整就绪检查。`,
    suggestion:
      '请运行“停止多媒体笔记工作台.vbs”，确认端口释放后再重新启动；不要继续使用浏览器中的旧页面。',
  });
  process.stderr.write(
    `[dev-windows] PID ${existingLauncher.pid} 仍存在，但服务未通过完整就绪检查；为避免假启动已停止。\n`,
  );
  process.exit(1);
}

let logFd = null;
const children = new Set();
let staticClientServer = null;
let shuttingDown = false;
let startupStage = '准备启动';
let startupCompleted = false;
let backendAlreadyRunning = false;

function parsePort(rawValue, fallback, name) {
  const port = Number.parseInt(rawValue || String(fallback), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} 必须是 1-65535 的整数，当前值: ${rawValue}`);
  }
  return port;
}

function writeLine(message) {
  const line = `${message}\n`;
  process.stdout.write(line);
  if (Number.isInteger(logFd)) fs.writeSync(logFd, line);
}

function writeLauncherReadyToken() {
  try {
    const currentOperationToken = readLauncherOperationToken();
    if (currentOperationToken) {
      runFileOperationWithRetry(() =>
        fs.writeFileSync(launcherReadyTokenPath, currentOperationToken, 'utf8'),
      );
    }
  } catch {
    // 直接从命令行启动时没有 HTA 操作令牌，不影响服务启动。
  }
}

function clearLauncherStartupState() {
  for (const tokenPath of [
    launcherReadyTokenPath,
    launcherUiReadyTokenPath,
    launcherFailurePath,
  ]) {
    try {
      runFileOperationWithRetry(() => fs.unlinkSync(tokenPath));
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        writeLine(
          `[dev-windows] 启动状态文件暂时被占用，已忽略旧状态并继续启动: ${path.basename(
            tokenPath,
          )}`,
        );
      }
    }
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isSpawnEperm(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return error?.code === 'EPERM' || /spawn\s+EPERM/i.test(message);
}

function toLauncherFailure(error) {
  const rawMessage =
    error instanceof Error ? error.message : String(error || '');
  const message = rawMessage.replace(/\s+/g, ' ').trim();
  const lowerMessage = message.toLowerCase();

  if (startupCompleted) {
    return {
      stage: '运行期后台失败',
      message: '后台服务在启动成功后意外终止',
      detail: message || '后台进程发生未预期的致命错误。',
      suggestion:
        '请运行“重启多媒体笔记工作台.vbs”，并在问题重复出现时通过启动器打开日志。',
    };
  }

  if (isSpawnEperm(error)) {
    return {
      stage: startupStage || '启动失败',
      message: 'Windows 暂时拒绝创建启动进程',
      detail:
        'Node.js 子进程未能启动，通常由安全软件实时扫描或进程创建权限限制造成。',
      suggestion:
        '已自动重试。若仍失败，请将 node.exe 和本项目目录加入安全软件排除项后，点击“重新尝试”。',
    };
  }
  if (
    error?.code === 'EADDRINUSE' ||
    lowerMessage.includes('eaddrinuse') ||
    message.includes('已被占用')
  ) {
    return {
      stage: startupStage || '启动失败',
      message: '所需端口已被其他程序占用',
      detail: '当前服务无法绑定本地端口，因此未能完成启动。',
      suggestion:
        '请先关闭占用该端口的程序，或在启动页选择“重新尝试”。必要时可点击“打开日志”查看端口号。',
    };
  }
  if (error?.code === 'ENOENT' || lowerMessage.includes('缺少依赖文件')) {
    return {
      stage: startupStage || '启动失败',
      message: '启动所需的文件或依赖缺失',
      detail: '项目无法找到必要的 Node.js 依赖或构建文件。',
      suggestion:
        '请在项目目录执行 npm.cmd install 后重新启动；详情可在日志中查看。',
    };
  }
  return {
    stage: startupStage || '启动失败',
    message: '启动过程中发生未预期的错误',
    detail: '服务未达到可访问状态，因此不会自动打开浏览器或关闭启动页。',
    suggestion: '请点击“打开日志”查看完整诊断信息，处理后再点击“重新尝试”。',
  };
}

function writeLauncherFailure(error) {
  const currentOperationToken = readLauncherOperationToken();
  if (!currentOperationToken) return;
  const failure = {
    operationToken: currentOperationToken,
    ...toLauncherFailure(error),
    timestamp: Date.now(),
  };
  const temporaryPath = `${launcherFailurePath}.${process.pid}.tmp`;
  try {
    runFileOperationWithRetry(() =>
      fs.writeFileSync(temporaryPath, JSON.stringify(failure), 'utf8'),
    );
    runFileOperationWithRetry(() => {
      try {
        fs.unlinkSync(launcherFailurePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      fs.renameSync(temporaryPath, launcherFailurePath);
    });
  } catch (writeError) {
    try {
      runFileOperationWithRetry(() => fs.unlinkSync(temporaryPath));
    } catch {
      // 临时文件不存在或已被清理。
    }
    writeLine(
      `[dev-windows] 无法写入启动失败状态: ${
        writeError instanceof Error ? writeError.message : String(writeError)
      }`,
    );
  }
}

process.on('uncaughtExceptionMonitor', (error, origin) => {
  try {
    startupStage = startupCompleted ? '运行期后台失败' : startupStage;
    writeLine(
      `[dev-windows] 致命错误（${origin}）: ${error.stack || error.message}`,
    );
    writeLauncherFailure(error);
  } catch {
    // 保留 Node.js 默认退出行为，避免监控逻辑掩盖原始致命错误。
  }
});

function pipeWithPrefix(stream, name) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) writeLine(`[${name}] ${line}`);
  });
  stream.on('end', () => {
    if (pending) writeLine(`[${name}] ${pending}`);
  });
}

function startNodeProcess(name, args, envOverrides = {}, pipeOutput = true) {
  const spawnOptions = {
    cwd: rootDir,
    env: { ...process.env, ...envOverrides },
    windowsHide: true,
  };
  let child;
  let outputCaptured = pipeOutput;
  try {
    child = spawn(process.execPath, args, {
      ...spawnOptions,
      stdio: pipeOutput ? ['ignore', 'pipe', 'pipe'] : ['ignore', logFd, logFd],
    });
  } catch (error) {
    if (!isSpawnEperm(error) || !pipeOutput) {
      if (isSpawnEperm(error)) {
        writeLine(
          `[dev-windows] ${name} 启动失败: spawn EPERM（Windows 拒绝创建子进程）。`,
        );
      }
      throw error;
    }

    writeLine(
      `[dev-windows] ${name} 的实时输出管道被 Windows 拒绝，已自动切换到日志直写模式继续启动。`,
    );
    outputCaptured = false;
    try {
      child = spawn(process.execPath, args, {
        ...spawnOptions,
        stdio: ['ignore', logFd, logFd],
      });
    } catch (fallbackError) {
      writeLine(
        `[dev-windows] ${name} 日志直写模式也无法创建进程: ${
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
        }`,
      );
      throw fallbackError;
    }
  }

  children.add(child);
  if (outputCaptured) {
    pipeWithPrefix(child.stdout, name);
    pipeWithPrefix(child.stderr, name);
  }
  child.once('close', () => children.delete(child));
  return child;
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

async function runBuild() {
  const buildAttempts = 3;
  for (let attempt = 1; attempt <= buildAttempts; attempt += 1) {
    writeLine(`[dev-windows] 构建后端（${attempt}/${buildAttempts}）...`);
    try {
      const build = startNodeProcess('build', [nestCliPath, 'build'], {
        NODE_ENV: 'production',
      });
      const result = await waitForExit(build);
      if (result.code !== 0) {
        throw new Error(
          `后端构建失败，退出码: ${result.code ?? result.signal ?? 'unknown'}`,
        );
      }
      if (!fs.existsSync(serverEntryPath)) {
        throw new Error(`后端构建完成但未找到入口: ${serverEntryPath}`);
      }
      return;
    } catch (error) {
      if (isSpawnEperm(error) && attempt < buildAttempts) {
        writeLine('[dev-windows] 后端构建进程创建受阻，2 秒后自动重试...');
        await delay(2000);
        continue;
      }
      throw error;
    }
  }
}

function latestFileMtime(rootPath) {
  if (!fs.existsSync(rootPath)) return 0;
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) return stat.mtimeMs;
  return fs
    .readdirSync(rootPath, { withFileTypes: true })
    .reduce((latest, entry) => {
      const entryPath = path.join(rootPath, entry.name);
      return Math.max(latest, latestFileMtime(entryPath));
    }, stat.mtimeMs);
}

function getStaticClientAssetPaths() {
  const fallbackIndex = path.join(
    clientOutputPath,
    'static-fallback-index.html',
  );
  if (!fs.existsSync(fallbackIndex)) return null;
  const html = fs.readFileSync(fallbackIndex, 'utf8');
  const bundleMatch = html.match(/\/assets\/(index-[^"']+\.js)/u);
  const cssMatch = html.match(/\/assets\/(index-[^"']+\.css)/u);
  if (!bundleMatch || !cssMatch) return null;
  return {
    bundlePath: path.join(clientOutputPath, 'assets', bundleMatch[1]),
    cssPath: path.join(clientOutputPath, 'assets', cssMatch[1]),
  };
}

function getStaticClientBundlePath() {
  return getStaticClientAssetPaths()?.bundlePath || null;
}

function isLocalClientBundle() {
  const bundlePath = getStaticClientBundlePath();
  if (!bundlePath || !fs.existsSync(bundlePath)) return false;
  return fs.readFileSync(bundlePath, 'utf8').includes('/api/local-uploads');
}

function isClientBuildCurrent() {
  const assets = getStaticClientAssetPaths();
  if (
    !assets ||
    !fs.existsSync(assets.bundlePath) ||
    !fs.existsSync(assets.cssPath)
  ) {
    return false;
  }
  const outputMtime = Math.min(
    fs.statSync(assets.bundlePath).mtimeMs,
    fs.statSync(assets.cssPath).mtimeMs,
  );
  const sourceMtime = Math.max(
    latestFileMtime(path.join(rootDir, 'client', 'src')),
    latestFileMtime(path.join(rootDir, 'client', 'index.html')),
    latestFileMtime(path.join(rootDir, 'shared')),
    latestFileMtime(path.join(rootDir, 'vite.config.ts')),
  );
  return outputMtime > 0 && outputMtime >= sourceMtime && isLocalClientBundle();
}

async function ensureClientBuild() {
  if (isClientBuildCurrent()) {
    writeLine('[dev-windows] 客户端静态产物已是最新，跳过构建');
    return;
  }

  const buildAttempts = 2;
  let lastError;
  for (let attempt = 1; attempt <= buildAttempts; attempt += 1) {
    writeLine(`[dev-windows] 构建客户端（${attempt}/${buildAttempts}）...`);
    try {
      const build = startNodeProcess(
        'build-client',
        [
          viteCliPath,
          'build',
          '--config',
          'vite.config.ts',
          '--configLoader',
          'native',
        ],
        {
          NODE_ENV: 'production',
          MIAODA_LOCAL_DEV: '1',
          VITE_RUNTIME: 'local',
          VITE_STABLE_MODE: 'true',
        },
        false,
      );
      const result = await waitForExit(build);
      if (result.code !== 0) {
        throw new Error(
          `客户端构建失败，退出码: ${result.code ?? result.signal ?? 'unknown'}`,
        );
      }
      if (!isClientBuildCurrent()) {
        throw new Error('客户端构建完成但产物仍落后于源码');
      }
      writeLine('[dev-windows] 客户端构建完成');
      return;
    } catch (error) {
      lastError = error;
      if (attempt < buildAttempts) await delay(2000);
    }
  }
  throw lastError || new Error('客户端构建失败');
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(800);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForPort(name, host, port, child, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`${name} 在监听 ${host}:${port} 前已退出`);
    }
    if (await canConnect(host, port)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `等待 ${name} 端口 ${host}:${port} 超时（${Math.round(timeoutMs / 1000)}s）。` +
      `若端口被其他进程占用，先运行 npm run stop，或执行: netstat -ano | findstr :${port} 查占用进程`,
  );
}

async function waitForPortClosed(host, port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await canConnect(host, port))) return;
    await delay(200);
  }
  throw new Error(`端口 ${host}:${port} 在停止前端进程后仍被占用`);
}

function startStaticClientFallback() {
  process.env.NODE_ENV = 'production';
  process.env.CLIENT_DEV_HOST = clientHost;
  process.env.CLIENT_DEV_PORT = String(clientPort);
  process.env.CLIENT_BASE_PATH = clientBasePath;
  process.env.SERVER_HOST = serverHost;
  process.env.SERVER_PORT = String(serverPort);
  const staticClientInstanceToken = `${process.pid}-${Date.now()}`;
  process.env.STATIC_CLIENT_INSTANCE_TOKEN = staticClientInstanceToken;
  staticClientServer = require(staticClientPath).start();
  return waitForStaticClientReady(
    staticClientServer,
    staticClientInstanceToken,
  );
}

function requestHttp(target, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const request = http.get(target, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        if (body.length < 32768) body += chunk;
      });
      response.on('end', () => {
        resolve({
          status: response.statusCode || 0,
          contentType: String(
            response.headers['content-type'] || '',
          ).toLowerCase(),
          headers: response.headers,
          body,
        });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy());
    request.once('error', () =>
      resolve({ status: 0, contentType: '', headers: {}, body: '' }),
    );
  });
}

async function probeExistingBackend() {
  const [runtime, readiness] = await Promise.all([
    requestHttp(`http://${serverHost}:${serverPort}/api/runtime`),
    requestHttp(
      `http://${serverHost}:${serverPort}/api/note-jobs/readiness`,
      12000,
    ),
  ]);
  return isBackendServiceReady(runtime, readiness);
}

async function waitForStaticClientReady(server, instanceToken) {
  try {
    await server.ready;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `静态前端兜底服务无法绑定 ${clientHost}:${clientPort}：${message}`,
    );
  }

  const response = await requestHttp(appUrl);
  const responseToken = String(
    response.headers?.['x-media-notes-static-client'] || '',
  );
  if (responseToken !== instanceToken) {
    throw new Error(
      `静态前端兜底服务未接管 ${clientHost}:${clientPort}。` +
        '端口可能被残留进程占用，已停止本次启动以避免等待超时。',
    );
  }
}

async function waitForApplicationReady(child, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  // Probe the browser-facing origin/path so proxy and base-path failures are
  // treated as startup failures instead of being hidden by a direct backend
  // response.
  const runtimeUrl = `${appUrl}api/runtime`;
  const readinessUrl = `${appUrl}api/note-jobs/readiness`;
  let lastFailureReason = '服务尚未返回有效状态';
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error('前端在页面可访问前已退出');
    }
    const inspection = await inspectApplicationReadiness({
      pageUrl: appUrl,
      readinessUrl,
      runtimeUrl,
      request: (target) =>
        requestHttp(target, target === readinessUrl ? 12000 : 2500),
    });
    if (inspection.ready) return;
    lastFailureReason = inspection.reason;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `等待工作台完整可用超时（${Math.round(timeoutMs / 1000)}s）：${appUrl}。` +
      `最后检测结果：${lastFailureReason}`,
  );
}

function terminateProcessTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  if (process.platform === 'win32') {
    const result = spawnSync(
      'taskkill',
      ['/PID', String(child.pid), '/T', '/F'],
      {
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    if (result.status === 0) return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // The process may have exited between the port check and termination.
  }
}

function clearPidFile() {
  try {
    if (fs.readFileSync(pidPath, 'utf8').trim() === String(process.pid)) {
      fs.unlinkSync(pidPath);
    }
  } catch {
    // PID 文件已删除或被新进程替换。
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  staticClientServer?.close();
  for (const child of [...children]) terminateProcessTree(child);
  clearPidFile();
  if (Number.isInteger(logFd)) {
    try {
      fs.closeSync(logFd);
    } catch {
      // 日志文件已关闭。
    }
  }
  process.exit(exitCode);
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));
process.once('exit', (exitCode) => {
  clearPidFile();
  if (!startupCompleted && !shuttingDown && exitCode !== 0) {
    writeLauncherFailure(
      new Error('启动进程意外退出，请查看日志确认具体原因。'),
    );
  }
});

async function main() {
  clearLauncherStartupState();
  startupStage = '准备本地运行配置';
  const runtimeConfig = ensureLocalRuntimeConfig(rootDir);
  writeLine(
    runtimeConfig.created
      ? `[dev-windows] 已创建本地运行配置: ${runtimeConfig.configPath}`
      : `[dev-windows] 已验证本地运行配置: ${runtimeConfig.configPath}`,
  );
  startupStage = '检查启动环境';
  for (const requiredPath of [nestCliPath, viteCliPath]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(
        `缺少依赖文件: ${requiredPath}。请先运行 npm.cmd install。`,
      );
    }
  }
  // 端口预检：被其他进程占用时直接报错，避免启动后空等 120s 超时
  for (const [pName, pHost, pPort] of [
    ['后端', serverHost, serverPort],
    ['前端', clientHost, clientPort],
  ]) {
    if (await canConnect(pHost, pPort)) {
      if (pName === '后端' && (await probeExistingBackend())) {
        backendAlreadyRunning = true;
        writeLine(
          `[dev-windows] 检测到已就绪后端 ${serverHost}:${serverPort}，复用现有服务并继续启动前端`,
        );
        continue;
      }
      throw new Error(
        `${pName} 端口 ${pHost}:${pPort} 已被占用。先运行 npm run stop，或执行: netstat -ano | findstr :${pPort} 查占用进程后结束它`,
      );
    }
  }
  const handleUnexpectedExit = (name) => (code, signal) => {
    if (shuttingDown) return;
    writeLine(`[dev-windows] ${name} 意外退出: ${code ?? signal ?? 'unknown'}`);
    if (!startupCompleted) {
      writeLauncherFailure(
        new Error(`${name} 在启动完成前意外退出，请查看日志确认具体原因。`),
      );
    }
    shutdown(code || 1);
  };

  writeLine(`[dev-windows] PID: ${process.pid}`);
  writeLine(`[dev-windows] 日志: ${logPath}`);
  if (skipBuild) {
    if (!fs.existsSync(serverEntryPath)) {
      throw new Error(`缺少已构建的后端入口: ${serverEntryPath}`);
    }
    writeLine('[dev-windows] 使用已构建的后端入口');
  } else {
    startupStage = '后端构建失败';
    await runBuild();
  }

  if (useStaticClient && !skipBuild) {
    startupStage = '前端构建失败';
    await ensureClientBuild();
  }

  startupStage = '后端启动失败';
  writeLine(`[dev-windows] 启动后端: http://${serverHost}:${serverPort}`);
  writeLine(
    '[dev-windows] 冷启动可能需要 1-2 分钟（杀毒软件实时扫描），请等待「项目已启动」提示，勿重复启动',
  );
  if (backendAlreadyRunning) {
    writeLine('[dev-windows] 使用已就绪的后端进程，不重复绑定后端端口');
  } else {
    process.env.NODE_ENV = 'development';
    process.env.SERVER_HOST = serverHost;
    process.env.SERVER_PORT = String(serverPort);
    require(serverEntryPath);
    await waitForPort('后端', serverHost, serverPort, null);
  }
  writeLine(`[dev-windows] 后端端口已就绪: ${serverHost}:${serverPort}`);

  // 生产构建会把带哈希资源地址的 HTML 写入 dist/client/index.html。
  // Vite 开发服务启动前必须移除它，否则会返回旧入口并出现 HTTP 200 白屏。
  fs.rmSync(clientIndexPath, { force: true });
  startupStage = '前端启动失败';
  const clientStartAttempts = 3;
  const clientPortTimeoutMs = 15000;
  let client = null;
  let clientStartError = null;
  if (useStaticClient) {
    writeLine('[dev-windows] Windows 稳定模式使用静态前端资源');
    await startStaticClientFallback();
  }
  for (
    let attempt = 1;
    !useStaticClient && attempt <= clientStartAttempts;
    attempt += 1
  ) {
    writeLine(
      `[dev-windows] 启动前端（${attempt}/${clientStartAttempts}）: ${appUrl}`,
    );
    try {
      client = startNodeProcess(
        'client',
        [viteCliPath, '--config', 'vite.config.ts', '--configLoader', 'native'],
        {
          NODE_ENV: 'development',
          MIAODA_LOCAL_DEV: '1',
          VITE_RUNTIME: 'local',
          VITE_STABLE_MODE: 'true',
          CLIENT_DEV_HOST: clientHost,
          CLIENT_DEV_PORT: String(clientPort),
        },
        false,
      );
      await waitForPort(
        '前端',
        clientHost,
        clientPort,
        client,
        clientPortTimeoutMs,
      );
      clientStartError = null;
      break;
    } catch (error) {
      clientStartError = error;
      terminateProcessTree(client);
      await waitForPortClosed(clientHost, clientPort);
      if (attempt < clientStartAttempts) {
        writeLine('[dev-windows] 前端启动失败，2 秒后重试...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  if (clientStartError) {
    writeLine('[dev-windows] Vite 启动失败，切换到静态前端兜底服务');
    await startStaticClientFallback();
  }
  if (!client && !staticClientServer) {
    throw clientStartError || new Error('前端启动失败');
  }
  startupStage = '验证服务可访问性';
  if (!staticClientServer) {
    try {
      await waitForApplicationReady(client, 8000);
    } catch (error) {
      writeLine(
        `[dev-windows] 前端页面验证失败，切换到静态前端兜底服务: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      terminateProcessTree(client);
      await waitForPortClosed(clientHost, clientPort);
      client = null;
      await startStaticClientFallback();
      await waitForApplicationReady(null, 15000);
    }
  } else {
    await waitForApplicationReady(null, 15000);
  }
  writeLine('[dev-windows] 页面和本地 API 已验证可访问');
  startupCompleted = true;
  client?.once('close', handleUnexpectedExit('前端'));
  writeLauncherReadyToken();
  writeLine(`[dev-windows] 项目已启动: ${appUrl}`);
}

async function bootstrap() {
  const existingLauncher = await ensureNoExistingLauncher();
  if (existingLauncher) {
    // 启动窗口会为每次操作写入新令牌。若服务已经由本项目启动器运行，
    // 必须由已验证服务或原启动进程接管；不能仅凭一个存活 PID 宣布成功。
    exitForExistingLauncher(existingLauncher);
  }
  if (!claimPidFile()) {
    const claimedLauncher = await ensureNoExistingLauncher();
    if (claimedLauncher) exitForExistingLauncher(claimedLauncher);
    if (!claimPidFile()) {
      throw new Error('无法独占项目 PID 文件，请稍后重试。');
    }
  }
  logFd = fs.openSync(logPath, 'a');
  await main();
}

bootstrap().catch((error) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  writeLine(`[dev-windows] 启动失败: ${message}`);
  writeLauncherFailure(error);
  shutdown(1);
});
