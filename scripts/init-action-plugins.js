#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPackage = '@lark-apaas/fullstack-cli@latest';

function runNpx() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    command,
    ['-y', cliPackage, 'action-plugin', 'init'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      windowsHide: process.platform === 'win32',
    },
  );
  return result.status ?? 1;
}

function findCachedCli() {
  if (process.platform !== 'win32') return undefined;
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return undefined;

  const npxRoot = path.join(localAppData, 'npm-cache', '_npx');
  if (!fs.existsSync(npxRoot)) return undefined;

  const candidates = fs
    .readdirSync(npxRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(npxRoot, entry.name, 'node_modules', '@lark-apaas', 'fullstack-cli', 'dist', 'index.js'))
    .filter((candidate) => fs.existsSync(candidate))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  return candidates[0];
}

function runWindowsEsmFallback(cliPath) {
  const moduleUrl = pathToFileURL(cliPath).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import(${JSON.stringify(moduleUrl)})`,
      'fullstack-cli',
      'action-plugin',
      'init',
    ],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  return result.status ?? 1;
}

const initialStatus = runNpx();
if (initialStatus === 0 || process.platform !== 'win32') {
  process.exitCode = initialStatus;
} else {
  const cachedCli = findCachedCli();
  process.exitCode = cachedCli ? runWindowsEsmFallback(cachedCli) : initialStatus;
}
