#!/usr/bin/env node
'use strict';

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
const toolNames = fs.existsSync(toolsDirectory)
  ? fs.readdirSync(toolsDirectory).filter((fileName) => /\.(?:exe|cmd)$/iu.test(fileName))
  : [];
if (toolNames.length === 0) {
  const message = '未发现内置媒体工具（ffmpeg/yt-dlp），音视频客户需要额外安装或提供 tools 目录。';
  (strictMedia ? failures : warnings).push(message);
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
