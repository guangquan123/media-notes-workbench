#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
} catch {
  fs.unlinkSync(pidPath);
  console.log('[stop] 开发进程已停止，已清理过期 PID 文件。');
  process.exit(0);
}

if (process.platform === 'win32') {
  const powershellPath = process.env.SystemRoot
    ? path.join(
        process.env.SystemRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      )
    : 'powershell.exe';
  const inspection = spawnSync(
    powershellPath,
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$process = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; [Console]::Out.Write($process.CommandLine)`,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  const commandLine = (inspection.stdout || '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/');
  const inspectionBlocked = inspection.error?.code === 'EPERM';
  if (
    !inspectionBlocked &&
    (inspection.status !== 0 || !commandLine.includes('scripts/dev-local.js') && !commandLine.includes('scripts/dev.js'))
  ) {
    const reason = (
      inspection.stderr ||
      inspection.error?.message ||
      ''
    ).trim();
    console.error(
      `[stop] 拒绝停止 PID ${pid}：无法确认它属于本项目 Windows 启动器。${reason ? ` ${reason}` : ''}`,
    );
    process.exit(1);
  }
  if (inspectionBlocked) {
    console.warn('[stop] 无法读取 Windows 进程命令行，改用项目 PID 文件执行定向停止。');
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
