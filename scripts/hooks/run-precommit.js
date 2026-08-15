#!/usr/bin/env node
// FULLSTACK_PRECOMMIT_V1
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SEP = '  ' + '─'.repeat(36);

// package-lock.json 锁内网镜像源 → 线上构建无法访问,改用公共镜像源。
// 后续如有其它内网域名需要拦截,在这里加 pattern 即可。
const INTERNAL_REGISTRY_PATTERNS = [/bnpm\.byted\.org/];

function getNpmInvocation(args) {
  if (process.platform !== 'win32') {
    return { command: 'npm', args };
  }

  const npmCliPath = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );

  if (fs.existsSync(npmCliPath)) {
    return { command: process.execPath, args: [npmCliPath, ...args] };
  }

  return { command: 'npm.cmd', args };
}

function failAndExit(step, body) {
  process.stderr.write('\n✗ pre-commit failed: ' + step + '\n');
  process.stderr.write(SEP + '\n');
  if (body && body.length > 0) {
    process.stderr.write(body.replace(/\s+$/, '') + '\n');
  }
  process.stderr.write(SEP + '\n');
  process.stderr.write('  bypass: git commit --no-verify\n');
  process.exit(1);
}

function checkLockfileRegistry() {
  const res = spawnSync(
    'git',
    ['diff', '--cached', '--diff-filter=ACMR', '--', 'package-lock.json'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: process.platform === 'win32',
    },
  );
  // git 不可用 / 不在 git 仓库 → 静默放行,交给 lint 步骤报错
  if (res.error || res.status !== 0) return;
  const diff = res.stdout ? res.stdout.toString() : '';
  // 只看本次新增行(`+` 开头但排除 `+++` 文件头)
  const hit = diff
    .split('\n')
    .some(
      (line) =>
        line.startsWith('+') &&
        !line.startsWith('+++') &&
        INTERNAL_REGISTRY_PATTERNS.some((p) => p.test(line)),
    );
  if (!hit) return;
  failAndExit(
    'package-lock.json 使用了内网镜像源',
    [
      '线上构建环境无法访问内网镜像源，将导致部署阶段 npm install 失败。',
      '请使用公共镜像源重新生成 lockfile：',
      '',
      '  rm -rf node_modules package-lock.json',
      '  npm install --registry=https://registry.npmmirror.com',
    ].join('\n'),
  );
}

function runLint() {
  const cwd = process.cwd();
  const invocation = getNpmInvocation(['run', 'lint']);
  const res = spawnSync(invocation.command, invocation.args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    windowsHide: process.platform === 'win32',
  });
  if (res.error) {
    failAndExit('lint', String(res.error.message || res.error));
  }
  if (res.status !== 0) {
    const stdout = res.stdout ? res.stdout.toString() : '';
    const stderr = res.stderr ? res.stderr.toString() : '';
    failAndExit('lint', stdout + '\n' + stderr);
  }
}

checkLockfileRegistry();
runLint();
