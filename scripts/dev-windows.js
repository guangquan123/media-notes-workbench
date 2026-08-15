#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const skipBuild = process.argv.includes('--skip-build');
process.chdir(rootDir);

const logDir = path.resolve(rootDir, process.env.LOG_DIR || 'logs');
const pidDir = path.resolve(rootDir, 'pids');
const pidPath = path.join(pidDir, 'dev-local.pid');
const logPath = path.join(logDir, 'dev.std.log');

fs.mkdirSync(logDir, { recursive: true });
fs.mkdirSync(pidDir, { recursive: true });

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

for (const requiredPath of [nestCliPath, viteCliPath]) {
  if (!fs.existsSync(requiredPath)) {
    throw new Error(
      `缺少依赖文件: ${requiredPath}。请先运行 npm.cmd install。`,
    );
  }
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
  process.stdout.write(
    `[dev-windows] 项目已在运行（PID ${existingLauncherPid}），跳过重复启动。\n`,
  );
  process.exit(0);
}
fs.writeFileSync(pidPath, String(process.pid), 'utf8');
const logFd = fs.openSync(logPath, 'a');
const children = new Set();
let staticClientServer = null;
let shuttingDown = false;

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
  let child;
  try {
    child = spawn(process.execPath, args, {
      cwd: rootDir,
      env: { ...process.env, ...envOverrides },
      stdio: pipeOutput ? ['ignore', 'pipe', 'pipe'] : ['ignore', logFd, logFd],
      windowsHide: true,
    });
  } catch (error) {
    if (error && error.code === 'EPERM') {
      writeLine(
        `[dev-windows] ${name} 启动失败: spawn EPERM（通常被杀毒软件实时扫描拦截）。` +
          `请把 ${process.execPath} 和 ${rootDir} 加入杀毒软件排除项后重试`,
      );
    }
    throw error;
  }

  children.add(child);
  if (pipeOutput) {
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
  writeLine('[dev-windows] 构建后端...');
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
process.once('exit', clearPidFile);

async function main() {
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
    await runBuild();
  }

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
    staticClientServer = require(staticClientPath).start();
    await waitForPort('静态前端', clientHost, clientPort, null);
  }
  if (!client && !staticClientServer) {
    throw clientStartError || new Error('前端启动失败');
  }
  client?.once('close', handleUnexpectedExit('前端'));
  writeLine(`[dev-windows] 项目已启动: ${appUrl}`);
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  writeLine(`[dev-windows] 启动失败: ${message}`);
  shutdown(1);
});
