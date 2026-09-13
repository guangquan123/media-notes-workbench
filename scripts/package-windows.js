#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { APP_ID, buildInstallerScript } = require('./windows-installer-config.js');

const rootDir = path.resolve(__dirname, '..');
const version = require(path.join(rootDir, 'package.json')).version;
const args = process.argv.slice(2);
const outputRoot = path.resolve(
  valueAfter('--output') || path.join(rootDir, 'release', 'windows', version),
);
const runtimeNode = path.resolve(
  valueAfter('--node-runtime') ||
    process.env.WORKBENCH_NODE_RUNTIME ||
    process.execPath,
);
const compileInstaller = args.includes('--compile');
const appStage = path.join(outputRoot, 'app');
const installerPath = path.join(outputRoot, 'installer', 'MediaNotesWorkbench.iss');
const buildLockPath = `${outputRoot}.lock`;
let buildLockFd;

const PROTECTED_OUTPUT_SEGMENTS = new Set([
  '.git',
  'client',
  'dist',
  'node_modules',
  'scripts',
  'server',
  'shared',
  'test',
]);

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`[package-windows] ${message}\n`);
  process.exit(1);
}

function assertSafeOutputRoot() {
  const relative = path.relative(rootDir, outputRoot);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail(`输出目录必须位于项目根目录下，且不能是项目根目录: ${outputRoot}`);
  }
  const firstSegment = relative.split(path.sep)[0].toLowerCase();
  if (PROTECTED_OUTPUT_SEGMENTS.has(firstSegment)) {
    fail(`拒绝覆盖项目受保护目录，请使用 release 或 .tmp 下的输出目录: ${outputRoot}`);
  }
}

function acquireBuildLock() {
  fs.mkdirSync(path.dirname(outputRoot), { recursive: true });
  try {
    buildLockFd = fs.openSync(buildLockPath, 'wx');
    fs.writeSync(
      buildLockFd,
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
    );
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      fail(
        `发布目录正在被另一个打包进程使用: ${outputRoot}。` +
          '请等待已有打包完成后再重试。',
      );
    }
    fail(`无法创建打包锁 ${buildLockPath}: ${error.message}`);
  }
}

function releaseBuildLock() {
  if (buildLockFd === undefined) return;
  try {
    fs.closeSync(buildLockFd);
  } finally {
    buildLockFd = undefined;
    try {
      fs.rmSync(buildLockPath, { force: true });
    } catch {
      // The build result is still usable; leave the lock diagnostic to the next run.
    }
  }
}

process.on('exit', releaseBuildLock);

function copy(source, destination) {
  if (!fs.existsSync(source)) fail(`缺少发布输入: ${source}`);
  fs.cpSync(source, destination, { recursive: true });
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const USER_DATA_FILE_NAMES = new Set([
  '.connector-config.json',
  '.env.local',
  '.external-model-config.json',
  '.media-cleanup-config.json',
  '.media-cleanup-history.json',
  '.media-inbox-state.json',
  '.model-provider-config.json',
  '.minutes-transcription-state.json',
  '.recording-assets.json',
  '.recording-storage-settings.json',
  '.runtime-config.json',
  '.task-notification-config.json',
  '.tencent-asr-config.json',
]);

function assertPublishInputIsClean(directory) {
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (USER_DATA_FILE_NAMES.has(entry.name) || entry.name.endsWith('.tmp')) {
        fail(`发布输入包含运行时数据文件: ${entryPath}`);
      }
      if (entry.isDirectory()) pending.push(entryPath);
    }
  }
}

function writeInstallerScript() {
  const installerDir = path.dirname(installerPath);
  fs.mkdirSync(installerDir, { recursive: true });
  const iconPath = path.join(appStage, 'dist', 'client', 'app-icon.ico');
  const content = buildInstallerScript({
    sourcePath: appStage,
    iconPath,
    version,
  });
  fs.writeFileSync(installerPath, content, 'utf8');
}

function writeUninstallScripts() {
  const command = '@echo off\r\n' +
    'setlocal\r\n' +
    'if not exist "%~dp0unins000.exe" exit /b 1\r\n' +
    'start "" "%~dp0unins000.exe"\r\n' +
    'exit /b 0\r\n';
  fs.writeFileSync(path.join(appStage, 'uninstall.cmd'), command, 'ascii');
}

function compile() {
  const localAppData = process.env.LOCALAPPDATA;
  const compilerCandidates = [
    process.env.INNO_SETUP_COMPILER,
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    localAppData && path.join(localAppData, 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  ].filter(Boolean);
  const compiler = compilerCandidates.find((candidate) =>
    fs.existsSync(candidate),
  );
  if (!compiler || !fs.existsSync(compiler)) {
    fail(
      `未找到 Inno Setup 编译器。已生成 .iss，请安装 Inno Setup 6，` +
        '或设置 INNO_SETUP_COMPILER 指向 ISCC.exe 后重试 --compile。',
    );
  }
  const result = spawnSync(compiler, ['/Qp', installerPath], {
    cwd: path.dirname(installerPath),
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) fail(`Inno Setup 编译失败，退出码: ${result.status}`);
  const setupPath = path.join(
    path.dirname(installerPath),
    `Media-Notes-Workbench-${version}-Setup.exe`,
  );
  if (!fs.existsSync(setupPath)) {
    fail(`Inno Setup 未生成预期安装包: ${setupPath}`);
  }
  const sizeMiB = (fs.statSync(setupPath).size / 1024 / 1024).toFixed(1);
  process.stdout.write(`[package-windows] Setup.exe 已生成: ${setupPath} (${sizeMiB} MiB)\n`);
}

if (!fs.existsSync(runtimeNode)) fail(`找不到 Node 运行时: ${runtimeNode}`);
assertSafeOutputRoot();
for (const required of [
  path.join(rootDir, 'dist', 'server'),
  path.join(rootDir, 'dist', 'client'),
  path.join(rootDir, 'dist', 'shared'),
  path.join(rootDir, 'dist', 'node_modules'),
]) {
  if (!fs.existsSync(required)) {
    fail(`缺少发布目录 ${required}。请先运行 npm run package:windows:build。`);
  }
}
for (const publishInput of [
  path.join(rootDir, 'dist', 'server'),
  path.join(rootDir, 'dist', 'client'),
  path.join(rootDir, 'dist', 'shared'),
]) {
  assertPublishInputIsClean(publishInput);
}

acquireBuildLock();
try {
  fs.rmSync(outputRoot, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  });
} catch (error) {
  fail(
    `无法清理旧发布目录: ${outputRoot}。请关闭正在使用该目录的程序后重试。` +
      ` 原因: ${error.message}`,
  );
}
if (fs.existsSync(outputRoot)) {
  fail(`旧发布目录未能完全清理: ${outputRoot}`);
}
fs.mkdirSync(appStage, { recursive: true });
copy(path.join(rootDir, 'dist', 'server'), path.join(appStage, 'dist', 'server'));
copy(path.join(rootDir, 'dist', 'client'), path.join(appStage, 'dist', 'client'));
copy(path.join(rootDir, 'dist', 'shared'), path.join(appStage, 'dist', 'shared'));
copy(path.join(rootDir, 'dist', 'node_modules'), path.join(appStage, 'node_modules'));
copy(runtimeNode, path.join(appStage, 'runtime', 'node.exe'));
fs.mkdirSync(path.join(appStage, 'scripts'), { recursive: true });
for (const fileName of [
  'application-readiness.js',
  'dev-windows.js',
  'installed-launcher.js',
  'installed-restart.js',
  'installed-stop.js',
  'launcher-process.js',
  'launcher-status.js',
  'local-runtime-config.js',
  'migrate-local-runtime.js',
  'restart-windows.js',
  'run-hidden.vbs',
  'runtime-paths.js',
  'static-client.js',
  'stop.js',
]) {
  copy(path.join(rootDir, 'scripts', fileName), path.join(appStage, 'scripts', fileName));
}
const installerIcon = path.join(appStage, 'dist', 'client', 'app-icon.ico');
if (!fs.existsSync(installerIcon)) {
  fail(`发布目录缺少安装器图标: ${installerIcon}`);
}
const manifest = {
  appVersion: version,
  generatedAt: new Date().toISOString(),
  installerAppId: APP_ID,
  runtime: 'embedded-node',
  browserMode: 'default-browser',
  dataDirectory: '%LOCALAPPDATA%\\MediaNotesWorkbench\\data',
  runtimeDirectories: {
    cache: '%LOCALAPPDATA%\\MediaNotesWorkbench\\cache',
    config: '%LOCALAPPDATA%\\MediaNotesWorkbench\\config',
    data: '%LOCALAPPDATA%\\MediaNotesWorkbench\\data',
    logs: '%LOCALAPPDATA%\\MediaNotesWorkbench\\logs',
    state: '%LOCALAPPDATA%\\MediaNotesWorkbench\\runtime',
  },
  files: {
    serverEntry: 'dist/server/main.js',
    clientDirectory: 'dist/client',
    sharedDirectory: 'dist/shared',
    runtime: 'runtime/node.exe',
    runtimeSha256: hashFile(path.join(appStage, 'runtime', 'node.exe')),
  },
};
fs.writeFileSync(
  path.join(appStage, 'package-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);
writeUninstallScripts();
writeInstallerScript();
process.stdout.write(`[package-windows] 发布目录已生成: ${outputRoot}\n`);
process.stdout.write(`[package-windows] 安装器脚本: ${installerPath}\n`);
if (compileInstaller) compile();
