#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const strictMedia = process.argv.includes('--strict-media');
const failures = [];
const warnings = [];

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function requirePath(relativePath) {
  if (!exists(relativePath)) failures.push(`缺少发布输入: ${relativePath}`);
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
  } catch (error) {
    failures.push(`无法读取 JSON: ${relativePath}（${error.message}）`);
    return null;
  }
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function reportMediaProblem(message) {
  (strictMedia ? failures : warnings).push(message);
}

function isPathInside(parentDirectory, candidatePath) {
  const relativePath = path.relative(parentDirectory, candidatePath);
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function validateToolManifest(toolsDirectory) {
  const manifestPath = path.join(toolsDirectory, 'tool-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    reportMediaProblem('缺少媒体工具清单: tools/tool-manifest.json');
    return;
  }

  const manifest = readJson('tools/tool-manifest.json');
  if (!manifest || !Array.isArray(manifest.files)) {
    failures.push('媒体工具清单缺少 files 数组');
    return;
  }
  if (manifest.modelPolicy !== 'external-only') {
    failures.push('媒体工具清单必须声明 modelPolicy=external-only');
  }

  const manifestFiles = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
      failures.push('媒体工具清单包含无效文件条目');
      continue;
    }
    const filePath = path.resolve(toolsDirectory, entry.path);
    if (!isPathInside(toolsDirectory, filePath)) {
      failures.push(`媒体工具清单路径越界: ${entry.path}`);
      continue;
    }
    manifestFiles.add(entry.path.toLowerCase());
    if (!fs.existsSync(filePath)) {
      reportMediaProblem(`媒体工具清单文件缺失: tools/${entry.path}`);
      continue;
    }
    const actualSha256 = hashFile(filePath);
    if (actualSha256 !== entry.sha256.toLowerCase()) {
      failures.push(`媒体工具 SHA-256 不匹配: tools/${entry.path}`);
    }
  }

  for (const requiredFile of ['ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe']) {
    if (!manifestFiles.has(requiredFile)) {
      failures.push(`媒体工具清单未登记必需文件: ${requiredFile}`);
    }
  }
}

if (Number(process.versions.node.split('.')[0]) < 22) {
  failures.push(`Node.js 版本过低: ${process.versions.node}，需要 >= 22`);
}
for (const relativePath of [
  'package.json',
  'package-lock.json',
  'dist/server/main.js',
  'dist/client/index.html',
  'dist/shared',
  'dist/node_modules',
  'scripts/installed-launcher.js',
  'scripts/runtime-tools.js',
  'client/public/app-icon.ico',
]) {
  requirePath(relativePath);
}

const packageJson = readJson('package.json');
if (packageJson && !packageJson.version) {
  failures.push('package.json 缺少版本号');
}

const toolsDirectory = path.join(rootDir, 'tools');
const requiredTools = ['ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe'];
const missingTools = requiredTools.filter(
  (fileName) => !fs.existsSync(path.join(toolsDirectory, fileName)),
);
if (missingTools.length > 0) {
  reportMediaProblem(`缺少内置媒体工具: ${missingTools.join(', ')}`);
} else {
  validateToolManifest(toolsDirectory);
}

if (fs.existsSync(toolsDirectory)) {
  const forbiddenModelFiles = fs
    .readdirSync(toolsDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /\.(?:bin|gguf|onnx|safetensors|pt|pth)$/iu.test(entry.name),
    );
  if (forbiddenModelFiles.length > 0) {
    failures.push(
      `tools 目录禁止包含模型权重: ${forbiddenModelFiles
        .map((entry) => entry.name)
        .join(', ')}`,
    );
  }
}

if (failures.length > 0) {
  process.stderr.write('[release-preflight] 未通过:\n');
  failures.forEach((message) => process.stderr.write(`- ${message}\n`));
  if (warnings.length > 0) {
    process.stderr.write('[release-preflight] 警告:\n');
    warnings.forEach((message) => process.stderr.write(`- ${message}\n`));
  }
  process.exitCode = 1;
} else {
  process.stdout.write('[release-preflight] 通过\n');
  warnings.forEach((message) => process.stdout.write(`[release-preflight] 警告: ${message}\n`));
}
