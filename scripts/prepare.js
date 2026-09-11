#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const hookPath = path.join(projectRoot, '.githooks', 'pre-commit');

// chmod is only needed by POSIX shells; Windows executes the hook through Git.
if (process.platform !== 'win32' && fs.existsSync(hookPath)) {
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch {
    // Git hook permissions are optional and must not break installation.
  }
}

// Keep hook setup best-effort so npm install also works without Git installed.
try {
  spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: projectRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
} catch {
  // Git is optional for customers and some build environments.
}
