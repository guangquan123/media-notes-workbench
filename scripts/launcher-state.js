#!/usr/bin/env node
'use strict';

const LAUNCHER_STAGE_RANGES = Object.freeze({
  config: Object.freeze({ start: 0, end: 10 }),
  preflight: Object.freeze({ start: 10, end: 25 }),
  backend: Object.freeze({ start: 25, end: 50 }),
  frontend: Object.freeze({ start: 50, end: 70 }),
  readiness: Object.freeze({ start: 70, end: 90 }),
  browser: Object.freeze({ start: 90, end: 100 }),
});

function clampFraction(value) {
  const fraction = Number(value);
  if (!Number.isFinite(fraction)) return 0;
  return Math.max(0, Math.min(1, fraction));
}

function getLauncherStageProgress(stage, fraction) {
  const range = LAUNCHER_STAGE_RANGES[stage];
  if (!range) return 0;
  const normalized = clampFraction(fraction);
  return range.start + (range.end - range.start) * normalized;
}

function buildLauncherProgress({
  operationToken,
  stage,
  message,
  fraction = 0,
  attempt = 0,
  now = Date.now(),
}) {
  return {
    operationToken: String(operationToken || ''),
    stage: String(stage || 'preflight'),
    stageProgress: getLauncherStageProgress(stage, fraction),
    percent: getLauncherStageProgress(stage, fraction),
    message: String(message || ''),
    attempt: Number.isFinite(Number(attempt)) ? Number(attempt) : 0,
    timestamp: Number(now),
  };
}

function isLauncherProgressStale(progress, now = Date.now(), maxAgeMs = 10_000) {
  if (!progress || !Number.isFinite(Number(progress.timestamp))) return true;
  const age = Number(now) - Number(progress.timestamp);
  return age < 0 || age > Math.max(0, Number(maxAgeMs));
}

function classifyLauncherFailure({ code, stage, message } = {}) {
  const rawMessage = String(message || '').replace(/\s+/gu, ' ').trim();
  const lowerMessage = rawMessage.toLowerCase();
  const normalizedCode = String(code || '').toUpperCase();
  const base = {
    code: 'STARTUP_FAILED',
    stage: String(stage || '启动失败'),
    title: '启动过程中发生错误',
    detail: rawMessage || '本地服务未达到可访问状态。',
    suggestion: '请重试；如果问题重复出现，请打开日志查看诊断信息。',
    actions: ['retry', 'openLogs', 'close'],
  };

  if (
    normalizedCode === 'EADDRINUSE' ||
    normalizedCode === 'PORT_OCCUPIED' ||
    lowerMessage.includes('eaddrinuse') ||
    (rawMessage.includes('端口') && rawMessage.includes('占用'))
  ) {
    return {
      ...base,
      code: 'PORT_OCCUPIED',
      title: '所需端口已被其他程序占用',
      detail: '工作台无法绑定本地端口，因此未能完成启动。',
    };
  }

  if (
    normalizedCode === 'EPERM' ||
    normalizedCode === 'PROCESS_ACCESS_DENIED' ||
    lowerMessage.includes('spawn eperm') ||
    lowerMessage.includes('access is denied')
  ) {
    return {
      ...base,
      code: 'PROCESS_ACCESS_DENIED',
      title: 'Windows 暂时阻止启动进程',
      detail: '系统或安全软件阻止了本地启动进程。',
      suggestion: '请点击重试；如果仍失败，请检查安全软件对 node.exe 的拦截记录。',
    };
  }

  if (
    normalizedCode === 'UI_ACK_TIMEOUT' ||
    normalizedCode === 'BROWSER_OPEN_FAILED' ||
    rawMessage.includes('浏览器')
  ) {
    return {
      ...base,
      code: normalizedCode === 'BROWSER_OPEN_FAILED' ? 'BROWSER_OPEN_FAILED' : 'UI_ACK_TIMEOUT',
      title: '本地服务已就绪，但浏览器页面加载较慢',
      detail: '服务已经启动，可以手动打开工作台。',
      suggestion: '点击“打开工作台”重试；无需重复启动服务。',
      actions: ['openWorkbench', 'continueWaiting', 'openLogs', 'close'],
    };
  }

  if (
    normalizedCode === 'RUNTIME_MISSING' ||
    normalizedCode === 'ENOENT' ||
    lowerMessage.includes('缺少已构建的发布文件') ||
    lowerMessage.includes('缺少依赖文件')
  ) {
    return {
      ...base,
      code: 'RUNTIME_MISSING',
      title: '启动所需文件不完整',
      detail: '工作台缺少必要的运行文件或构建产物。',
      suggestion: '请重新安装工作台；开发环境请先执行 npm install。',
    };
  }

  return base;
}

module.exports = {
  LAUNCHER_STAGE_RANGES,
  buildLauncherProgress,
  classifyLauncherFailure,
  getLauncherStageProgress,
  isLauncherProgressStale,
};
