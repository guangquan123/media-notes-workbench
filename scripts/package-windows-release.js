#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const rootDirectory = path.resolve(__dirname, '..');
const requiredNodeMajorVersion = 22;
const installerStabilityCheckCount = 3;
const installerStabilityCheckIntervalMs = 3_000;
const installerStabilityTimeoutMs = 15 * 60 * 1_000;

function fail(message) {
  process.stderr.write(`[package-windows-release] ${message}\n`);
  process.exit(1);
}

function assertPrerequisites() {
  const nodeMajorVersion = Number(process.versions.node.split('.')[0]);
  if (nodeMajorVersion < requiredNodeMajorVersion) {
    fail(
      `Node.js 版本过低: ${process.versions.node}，` +
        `需要 >= ${requiredNodeMajorVersion}`,
    );
  }

  const requiredFiles = [
    'node_modules/@nestjs/cli/bin/nest.js',
    'node_modules/vite/bin/vite.js',
    'node_modules/@larksuite/cli/bin/lark-cli.exe',
    'tools/ffmpeg.exe',
    'tools/ffprobe.exe',
    'tools/yt-dlp.exe',
  ];
  for (const relativePath of requiredFiles) {
    if (!fs.existsSync(path.join(rootDirectory, relativePath))) {
      fail(`缺少打包依赖或内置工具: ${relativePath}`);
    }
  }
}

function runStep(label, scriptPath, args = [], environment = {}) {
  process.stdout.write(`\n==> ${label}\n`);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDirectory,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) fail(`${label} 无法启动: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${label} 失败，退出码: ${result.status ?? '未知'}`);
  }
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sleep(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function waitForStableInstaller(installerPath) {
  const deadline = Date.now() + installerStabilityTimeoutMs;
  let previousSize = -1;
  let stableChecks = 0;

  process.stdout.write('等待安装器压缩完成...\n');
  while (Date.now() < deadline) {
    try {
      const size = fs.statSync(installerPath).size;
      stableChecks = size > 0 && size === previousSize ? stableChecks + 1 : 0;
      if (stableChecks >= installerStabilityCheckCount) return;
      previousSize = size;
    } catch {
      previousSize = -1;
      stableChecks = 0;
    }
    sleep(installerStabilityCheckIntervalMs);
  }
  fail(`安装器未在限定时间内完成: ${installerPath}`);
}

assertPrerequisites();

runStep('清理旧构建产物', 'scripts/clean-windows-build.js');
runStep('构建服务端', 'node_modules/@nestjs/cli/bin/nest.js', ['build']);
runStep(
  '构建桌面端前端',
  'node_modules/vite/bin/vite.js',
  ['build', '--config', 'vite.config.ts'],
  {
    CLIENT_BASE_PATH: '/',
    MIAODA_LOCAL_DEV: '1',
    VITE_RUNTIME: 'local',
    VITE_STABLE_MODE: 'true',
  },
);
runStep('初始化内置插件', 'scripts/init-action-plugins.js');
runStep('整理运行时依赖', 'scripts/prune-smart.js');
runStep('发布前严格检查', 'scripts/release-preflight.js', ['--strict-media']);
runStep('生成 Windows 安装包', 'scripts/package-windows.js', ['--compile']);

const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8'),
);
const installerPath = path.join(
  rootDirectory,
  'release',
  'windows',
  packageJson.version,
  'installer',
  `Media-Notes-Workbench-${packageJson.version}-Setup.exe`,
);
if (!fs.existsSync(installerPath)) {
  fail(`未生成预期安装包: ${installerPath}`);
}
waitForStableInstaller(installerPath);

process.stdout.write('\n[package-windows-release] 打包成功\n');
process.stdout.write(`[package-windows-release] 安装包: ${installerPath}\n`);
process.stdout.write(
  `[package-windows-release] SHA-256: ${hashFile(installerPath)}\n`,
);
