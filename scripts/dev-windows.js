#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const skipBuild = process.argv.includes('--skip-build');
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

const launcherOperationToken = readLauncherOperationToken();

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
const staticClientPath = path.join(rootDir, 'scripts', 'static-client.js');
const { isApplicationReady } = require('./application-readiness.js');
const { ensureLocalRuntimeConfig } = require('./local-runtime-config.js');

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

function ensureNoExistingLauncher() {
  if (!fs.existsSync(pidPath)) return;
  const existingPid = Number.parseInt(
    fs.readFileSync(pidPath, 'utf8').trim(),
    10,
  );
  if (!Number.isInteger(existingPid) || existingPid <= 0) {
    fs.unlinkSync(pidPath);
    return;
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
  if (alive) {
    return existingPid;
  }
  fs.unlinkSync(pidPath);
  return null;
}

const existingLauncherPid = ensureNoExistingLauncher();
if (existingLauncherPid) {
  // 启动窗口会为每次操作写入新令牌。若服务已经由本项目启动器运行，
  // 必须接管该令牌，否则窗口会把“避免重复启动”误判为 120 秒超时。
  writeLauncherReadyToken();
  process.stdout.write(
    `[dev-windows] 项目已在运行（PID ${existingLauncherPid}），已接管当前启动窗口，不重复创建实例。\n`,
  );
  process.exit(0);
}
fs.writeFileSync(pidPath, String(process.pid), 'utf8');
const logFd = fs.openSync(logPath, 'a');
const children = new Set();
let staticClientServer = null;
let shuttingDown = false;
let startupStage = '准备启动';
let startupCompleted = false;

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
  fs.writeSync(logFd, line);
}

function writeLauncherReadyToken() {
  try {
    if (launcherOperationToken) {
      runFileOperationWithRetry(() =>
        fs.writeFileSync(
          launcherReadyTokenPath,
          launcherOperationToken,
          'utf8',
        ),
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
  if (!launcherOperationToken) return;
  const failure = {
    operationToken: launcherOperationToken,
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

async function waitForStaticClientReady(server, instanceToken) {
  try {
    await server.ready;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`静态前端兜底服务无法绑定 ${clientHost}:${clientPort}：${message}`);
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
  // 后端本地模式不依赖浏览器 Cookie，直接探测真实 API，避免 Vite
  // 前缀代理与平台认证状态把已启动的服务误判为超时。
  const runtimeUrl = `http://${serverHost}:${serverPort}/api/runtime`;
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error('前端在页面可访问前已退出');
    }
    if (
      await isApplicationReady({
        pageUrl: appUrl,
        runtimeUrl,
        request: requestHttp,
      })
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `等待工作台页面可访问超时（${Math.round(timeoutMs / 1000)}s）：${appUrl}`,
  );
}

function terminateProcessTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGTERM');
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
  try {
    fs.closeSync(logFd);
  } catch {
    // 日志文件已关闭。
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

  startupStage = '后端启动失败';
  writeLine(`[dev-windows] 启动后端: http://${serverHost}:${serverPort}`);
  writeLine(
    '[dev-windows] 冷启动可能需要 1-2 分钟（杀毒软件实时扫描），请等待「项目已启动」提示，勿重复启动',
  );
  process.env.NODE_ENV = 'development';
  process.env.SERVER_HOST = serverHost;
  process.env.SERVER_PORT = String(serverPort);
  require(serverEntryPath);
  await waitForPort('后端', serverHost, serverPort, null);
  writeLine(`[dev-windows] 后端端口已就绪: ${serverHost}:${serverPort}`);

  // 生产构建会把带哈希资源地址的 HTML 写入 dist/client/index.html。
  // Vite 开发服务启动前必须移除它，否则会返回旧入口并出现 HTTP 200 白屏。
  fs.rmSync(clientIndexPath, { force: true });
  startupStage = '前端启动失败';
  const clientStartAttempts = 3;
  let client = null;
  let clientStartError = null;
  for (let attempt = 1; attempt <= clientStartAttempts; attempt += 1) {
    writeLine(
      `[dev-windows] 启动前端（${attempt}/${clientStartAttempts}）: ${appUrl}`,
    );
    client = startNodeProcess(
      'client',
      [viteCliPath, '--config', 'vite.config.ts'],
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
    try {
      await waitForPort('前端', clientHost, clientPort, client);
      clientStartError = null;
      break;
    } catch (error) {
      clientStartError = error;
      terminateProcessTree(client);
      if (attempt < clientStartAttempts) {
        writeLine('[dev-windows] 前端启动失败，2 秒后重试...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  if (clientStartError) {
    writeLine('[dev-windows] Vite 启动失败，切换到静态前端兜底服务');
    process.env.NODE_ENV = 'production';
    process.env.CLIENT_DEV_HOST = clientHost;
    process.env.CLIENT_DEV_PORT = String(clientPort);
    process.env.CLIENT_BASE_PATH = clientBasePath;
    process.env.SERVER_HOST = serverHost;
    process.env.SERVER_PORT = String(serverPort);
    const staticClientInstanceToken = `${process.pid}-${Date.now()}`;
    process.env.STATIC_CLIENT_INSTANCE_TOKEN = staticClientInstanceToken;
    staticClientServer = require(staticClientPath).start();
    await waitForStaticClientReady(
      staticClientServer,
      staticClientInstanceToken,
    );
  }
  if (!client && !staticClientServer) {
    throw clientStartError || new Error('前端启动失败');
  }
  client?.once('close', handleUnexpectedExit('前端'));
  startupStage = '验证服务可访问性';
  await waitForApplicationReady(
    staticClientServer ? null : client,
    staticClientServer ? 15000 : 120000,
  );
  writeLine('[dev-windows] 页面和本地 API 已验证可访问');
  startupCompleted = true;
  writeLauncherReadyToken();
  writeLine(`[dev-windows] 项目已启动: ${appUrl}`);
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  writeLine(`[dev-windows] 启动失败: ${message}`);
  writeLauncherFailure(error);
  shutdown(1);
});
