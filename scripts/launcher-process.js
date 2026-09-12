#!/usr/bin/env node
'use strict';

const path = require('node:path');

function normalizeWindowsPath(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/');
}

function isWindowsInspectionBlocked(result) {
  const message = [result?.stderr || '', result?.error?.message || '']
    .join('\n')
    .toLowerCase();

  return (
    result?.error?.code === 'EPERM' ||
    message.includes('access is denied') ||
    message.includes('拒绝访问')
  );
}

function readWindowsProcessExecutable(pid, powershellPath, spawnSync) {
  try {
    const result = spawnSync(
      powershellPath,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; [Console]::Out.Write($process.Path)`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    return normalizeWindowsPath(result?.stdout || '');
  } catch {
    return '';
  }
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
    nodePath = process.execPath,
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
    const executablePath = readWindowsProcessExecutable(
      pid,
      powershellPath,
      spawnSync,
    );
    const sameRuntime =
      Boolean(executablePath) &&
      executablePath === normalizeWindowsPath(nodePath);
    return sameRuntime
      ? { ownership: 'unknown', sameRuntime: true }
      : { ownership: 'unknown' };
  }

  const commandLine = normalizeWindowsPath(result?.stdout || '');
  const expectedLauncher = normalizeWindowsPath(
    path.join(rootDir, 'scripts', 'dev-windows.js'),
  );
  const expectedStaticClient = normalizeWindowsPath(
    path.join(rootDir, 'scripts', 'static-client.js'),
  );
  const expectedStaticClientMarker = 'scripts/static-client.js';

  if (!commandLine) {
    const executablePath = readWindowsProcessExecutable(
      pid,
      powershellPath,
      spawnSync,
    );
    const sameRuntime =
      Boolean(executablePath) &&
      executablePath === normalizeWindowsPath(nodePath);
    return sameRuntime
      ? { ownership: 'unknown', sameRuntime: true }
      : { ownership: result?.status === 0 ? 'stale' : 'unknown' };
  }

  if (result?.status !== 0) {
    return { ownership: 'stale' };
  }

  return {
    ownership:
      commandLine.includes(expectedLauncher) ||
      commandLine.includes(expectedStaticClient) ||
      commandLine.includes(expectedStaticClientMarker)
        ? 'owned'
        : 'stale',
  };
}

function resolveExistingLauncherState({
  ownership,
  serviceState,
  pidFileAgeMs,
  startupGraceMs = 300000,
}) {
  if (serviceState === 'ready') return 'reuse-ready';
  if (ownership === 'stale') return 'stale';
  if (pidFileAgeMs <= startupGraceMs) return 'reuse-starting';
  if (ownership === 'owned') return 'blocked';
  return serviceState === 'unavailable' ? 'stale' : 'blocked';
}

module.exports = {
  inspectWindowsLauncherProcess,
  resolveExistingLauncherState,
};
