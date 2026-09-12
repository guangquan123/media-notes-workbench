#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const { inspectWindowsLauncherProcess } = require('./launcher-process.js');

const rootDir = path.resolve(process.env.WORKBENCH_APP_ROOT || process.cwd());
if (!process.env.WORKBENCH_HOME && process.env.WORKBENCH_INSTALLED !== '1') {
  process.env.WORKBENCH_HOME = path.join(
    process.env.LOCALAPPDATA || rootDir,
    'MediaNotesWorkbench',
    'dev',
  );
}
const { applyRuntimePathEnvironment } = require('./runtime-paths.js');
const runtimePaths = applyRuntimePathEnvironment(process.env, {
  cwd: rootDir,
});
const stateDir = runtimePaths.stateDir;
const currentPidPath = path.join(stateDir, 'dev-local.pid');
const legacyPidPath = path.join(rootDir, 'pids', 'dev-local.pid');
const pidPath = fs.existsSync(currentPidPath) || process.env.WORKBENCH_INSTALLED === '1'
  ? currentPidPath
  : legacyPidPath;
const envConfig = [
  path.join(rootDir, '.env'),
  path.join(rootDir, '.env.local'),
  path.join(runtimePaths.configDir, '.env'),
  path.join(runtimePaths.configDir, '.env.local'),
].reduce((merged, filePath) => {
  if (!fs.existsSync(filePath)) return merged;
  return { ...merged, ...dotenv.parse(fs.readFileSync(filePath)) };
}, {});

function readPort(name, fallback) {
  const parsed = Number.parseInt(envConfig[name] || '', 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) return parsed;
  return fallback;
}

function findListeningPids(ports) {
  if (process.platform !== 'win32') return [];
  const netstatPath = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'netstat.exe')
    : 'netstat';
  const result = spawnSync(netstatPath, ['-ano', '-p', 'tcp'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return [];
  const wanted = new Set(ports.map((port) => `:${port}`));
  const pids = new Set();
  for (const line of String(result.stdout || '').split(/\r?\n/u)) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length < 5 || fields[3] !== 'LISTENING') continue;
    const localAddress = fields[1] || '';
    const port = localAddress.substring(localAddress.lastIndexOf(':'));
    if (wanted.has(port)) {
      const pid = Number.parseInt(fields[4], 10);
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
  }
  return [...pids];
}

const sleepSignal = new Int32Array(new SharedArrayBuffer(4));

function isWindowsProcessRunning(pid) {
  const tasklistPath = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'tasklist.exe')
    : 'tasklist';
  const result = spawnSync(
    tasklistPath,
    ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) return undefined;
  const processRow = new RegExp(`^"[^"]+","${pid}",`, 'mu');
  return processRow.test(String(result.stdout || ''));
}

function hasProcessExited(pid) {
  if (process.platform === 'win32') {
    const running = isWindowsProcessRunning(pid);
    if (running !== undefined) return !running;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === 'ESRCH';
  }
}

function waitForProcessExit(pid, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasProcessExited(pid)) return true;
    Atomics.wait(sleepSignal, 0, 0, 200);
  }
  return hasProcessExited(pid);
}

function stopWindowsProcess(pid) {
  const taskkillArgs = ['/PID', String(pid), '/T', '/F'];
  const runTaskkill = () =>
    spawnSync('taskkill', taskkillArgs, {
      encoding: 'utf8',
      windowsHide: true,
    });
  const result = runTaskkill();
  let method = 'taskkill';
  if (result.status !== 0) {
    try {
      process.kill(pid, 'SIGTERM');
      method = 'signal';
    } catch {
      return {
        message: (result.stderr || result.stdout || '未知错误').trim(),
        stopped: false,
      };
    }
  }
  if (!waitForProcessExit(pid)) {
    const retry = runTaskkill();
    if (retry.status === 0 && waitForProcessExit(pid, 5000)) {
      return { method: 'taskkill-retry', stopped: true };
    }
    return {
      message: `停止命令已发送，但进程仍未退出: ${pid}`,
      stopped: false,
    };
  }
  return { method, stopped: true };
}

function stopByConfiguredPorts() {
  const ports = [
    Number.parseInt(process.env.SERVER_PORT || '', 10) || readPort('SERVER_PORT', 3000),
    Number.parseInt(process.env.CLIENT_DEV_PORT || '', 10) || readPort('CLIENT_DEV_PORT', 8081),
  ];
  const pids = findListeningPids(ports).filter((pid) => pid !== process.pid);
  if (pids.length === 0) return false;
  let stopped = false;
  for (const pid of pids) {
    const inspection = inspectWindowsLauncherProcess(pid, {
      rootDir,
      spawnSync,
      nodePath: process.env.WORKBENCH_RUNTIME_NODE || process.execPath,
    });
    if (inspection.ownership !== 'owned' && !inspection.sameRuntime) {
      if (inspection.ownership === 'unknown') {
        console.warn(
          `[stop] 无法确认端口 ${ports.join('/')} 的进程 ${pid} 属于本项目，已跳过，避免误停止其他程序。`,
        );
      }
      continue;
    }
    if (inspection.sameRuntime) {
      console.warn(
        `[stop] 端口进程 ${pid} 的命令行不可读，但确认使用当前 Node 运行时，按项目端口定向停止。`,
      );
    }
    const stopResult = stopWindowsProcess(pid);
    if (stopResult.stopped) {
      stopped = true;
    } else {
      console.error(`[stop] ${stopResult.message}`);
      process.exit(1);
    }
  }
  return stopped;
}

if (!fs.existsSync(pidPath)) {
  if (stopByConfiguredPorts()) {
    console.log('[stop] PID 文件缺失，已按项目端口停止本地开发进程树。');
  } else {
    console.log('[stop] 未发现本项目正在运行的本地开发进程。');
  }
  process.exit(0);
}

const rawPid = fs.readFileSync(pidPath, 'utf8').trim();
const pid = Number.parseInt(rawPid, 10);
if (!Number.isInteger(pid) || pid <= 0) {
  fs.unlinkSync(pidPath);
  if (stopByConfiguredPorts()) {
    console.log('[stop] 已清理无效 PID 文件，并按项目端口停止残留进程树。');
  } else {
    console.log('[stop] 已清理无效 PID 文件。');
  }
  process.exit(0);
}

try {
  process.kill(pid, 0);
} catch (error) {
  if (error?.code === 'ESRCH') {
    fs.unlinkSync(pidPath);
    if (stopByConfiguredPorts()) {
      console.log('[stop] PID 已过期，已按项目端口停止残留进程树。');
    } else {
      console.log('[stop] 开发进程已停止，已清理过期 PID 文件。');
    }
    process.exit(0);
  }
  if (error?.code !== 'EPERM') {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('[stop] 无法确认项目启动进程状态: ' + message);
    process.exit(1);
  }
  console.warn('[stop] 无法直接探测项目 PID，继续执行定向停止确认。');
}

if (process.platform === 'win32') {
  const inspection = inspectWindowsLauncherProcess(pid, {
    rootDir,
    spawnSync,
    nodePath: process.env.WORKBENCH_RUNTIME_NODE || process.execPath,
  });
  if (inspection.ownership === 'stale') {
    fs.unlinkSync(pidPath);
    if (stopByConfiguredPorts()) {
      console.log('[stop] PID 状态已过期，已按项目端口停止残留进程树。');
    } else {
      console.log(
        `[stop] PID 文件指向非本项目启动器进程 ${pid}，已清理过期状态，未停止该进程。`,
      );
    }
    process.exit(0);
  }
  if (inspection.ownership === 'unknown') {
    console.warn(
      '[stop] 无法读取 Windows 进程命令行，改用项目 PID 文件执行定向停止。',
    );
  }

  const stopResult = stopWindowsProcess(pid);
  if (!stopResult.stopped) {
    console.error(`[stop] 停止失败: ${stopResult.message}`);
    process.exit(1);
  }
  try {
    fs.unlinkSync(pidPath);
  } catch {
    // 启动器退出时可能已自行清理。
  }
  stopByConfiguredPorts();
  if (stopResult.method === 'signal') {
    console.log(`[stop] taskkill 不可用，已确认项目 PID ${pid} 退出。`);
  } else {
    console.log(`[stop] 已停止本项目 Windows 开发进程树 ${pid}。`);
  }
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
