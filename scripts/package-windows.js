#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`[package-windows] ${message}\n`);
  process.exit(1);
}

function copy(source, destination) {
  if (!fs.existsSync(source)) fail(`缺少发布输入: ${source}`);
  fs.cpSync(source, destination, { recursive: true });
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeInstallerScript() {
  const installerDir = path.dirname(installerPath);
  fs.mkdirSync(installerDir, { recursive: true });
  const sourcePath = path.relative(installerDir, appStage).replace(/\\/gu, '/');
  const content = `#define AppVersion "${version}"
[Setup]
AppId={{A8F7FD44-40D9-4AF7-9F80-2A7A1D90F2DA}
AppName=多媒体笔记工作台
AppVersion={#AppVersion}
AppPublisher=多媒体笔记工作台
DefaultDirName={localappdata}\\Programs\\多媒体笔记工作台
DefaultGroupName=多媒体笔记工作台
PrivilegesRequired=lowest
OutputDir=.
OutputBaseFilename=多媒体笔记工作台-{#AppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=多媒体笔记工作台
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "${sourcePath}/*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\\多媒体笔记工作台"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-launcher.js"""; WorkingDir: "{app}"
Name: "{group}\\多媒体笔记工作台"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-launcher.js"""; WorkingDir: "{app}"

[UninstallRun]
Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-stop.js"""; Flags: runhidden
`;
  fs.writeFileSync(installerPath, content, 'utf8');
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
    `多媒体笔记工作台-${version}-Setup.exe`,
  );
  if (!fs.existsSync(setupPath)) {
    fail(`Inno Setup 未生成预期安装包: ${setupPath}`);
  }
  const sizeMiB = (fs.statSync(setupPath).size / 1024 / 1024).toFixed(1);
  process.stdout.write(`[package-windows] Setup.exe 已生成: ${setupPath} (${sizeMiB} MiB)\n`);
}

if (!fs.existsSync(runtimeNode)) fail(`找不到 Node 运行时: ${runtimeNode}`);
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

fs.rmSync(outputRoot, { recursive: true, force: true });
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
  'installed-stop.js',
  'launcher-process.js',
  'launcher-status.js',
  'local-runtime-config.js',
  'run-hidden.vbs',
  'static-client.js',
  'stop.js',
]) {
  copy(path.join(rootDir, 'scripts', fileName), path.join(appStage, 'scripts', fileName));
}
const manifest = {
  appVersion: version,
  generatedAt: new Date().toISOString(),
  runtime: 'embedded-node',
  browserMode: 'default-browser',
  dataDirectory: '%LOCALAPPDATA%\\MediaNotesWorkbench',
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
writeInstallerScript();
process.stdout.write(`[package-windows] 发布目录已生成: ${outputRoot}\n`);
process.stdout.write(`[package-windows] 安装器脚本: ${installerPath}\n`);
if (compileInstaller) compile();
