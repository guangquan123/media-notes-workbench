#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectWindowsLauncherProcess } = require('./launcher-process.js');

const pidPath = path.resolve(process.cwd(), 'pids/dev-local.pid');

if (!fs.existsSync(pidPath)) {
  console.log('[stop] 未发现本项目正在运行的本地开发进程。');
  process.exit(0);
}

const rawPid = fs.readFileSync(pidPath, 'utf8').trim();
const pid = Number.parseInt(rawPid, 10);
if (!Number.isInteger(pid) || pid <= 0) {
  fs.unlinkSync(pidPath);
  console.log('[stop] 已清理无效 PID 文件。');
  process.exit(0);
}

try {
  process.kill(pid, 0);
} catch (error) {
  if (error?.code === 'ESRCH') {
    fs.unlinkSync(pidPath);
    console.log('[stop] 开发进程已停止，已清理过期 PID 文件。');
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
    rootDir: process.cwd(),
    spawnSync,
  });
  if (inspection.ownership === 'stale') {
    fs.unlinkSync(pidPath);
    console.log(
      `[stop] PID 文件指向非本项目启动器进程 ${pid}，已清理过期状态，未停止该进程。`,
    );
    process.exit(0);
  }
  if (inspection.ownership === 'unknown') {
    console.warn(
      '[stop] 无法读取 Windows 进程命令行，改用项目 PID 文件执行定向停止。',
    );
  }

  const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    try {
      process.kill(pid, 'SIGTERM');
      fs.unlinkSync(pidPath);
      console.log(`[stop] taskkill 不可用，已向项目 PID ${pid} 发送停止信号。`);
      process.exit(0);
    } catch {
      const message = (result.stderr || result.stdout || '未知错误').trim();
      console.error(`[stop] 停止失败: ${message}`);
      process.exit(1);
    }
  }
  try {
    fs.unlinkSync(pidPath);
  } catch {
    // 启动器退出时可能已自行清理。
  }
  console.log(`[stop] 已停止本项目 Windows 开发进程树 ${pid}。`);
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
