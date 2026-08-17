#!/usr/bin/env node
'use strict';

const path = require('node:path');

function normalizeWindowsPath(value) {
  return String(value || '').trim().toLowerCase().replace(/\\/g, '/');
}

function isWindowsInspectionBlocked(result) {
  const message = [
    result?.stderr || '',
    result?.error?.message || '',
  ]
    .join('\n')
    .toLowerCase();

  return (
    result?.error?.code === 'EPERM' ||
    message.includes('access is denied') ||
    message.includes('拒绝访问')
  );
}

/**
 * Classify the process currently referenced by dev-local.pid without ever
 * terminating it. A live PID alone is not sufficient on Windows because PID
 * values can be reused by unrelated processes after the original launcher exits.
 */
function inspectWindowsLauncherProcess(pid, options = {}) {
  const {
    rootDir = process.cwd(),
    platform = process.platform,
    env = process.env,
    spawnSync,
  } = options;

  if (platform !== 'win32' || typeof spawnSync !== 'function') {
    return { ownership: 'unknown' };
  }

  const powershellPath = env.SystemRoot
    ? path.join(
        env.SystemRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      )
    : 'powershell.exe';

  let result;
  try {
    result = spawnSync(
      powershellPath,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$process = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; [Console]::Out.Write($process.CommandLine)`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
  } catch {
    return { ownership: 'unknown' };
  }

  if (isWindowsInspectionBlocked(result)) {
    return { ownership: 'unknown' };
  }

  const commandLine = normalizeWindowsPath(result?.stdout || '');
  const expectedLauncher = normalizeWindowsPath(
    path.join(rootDir, 'scripts', 'dev-windows.js'),
  );

  if (result?.status !== 0 || !commandLine) {
    return { ownership: 'stale' };
  }

  return {
    ownership: commandLine.includes(expectedLauncher) ? 'owned' : 'stale',
  };
}

module.exports = {
  inspectWindowsLauncherProcess,
};
