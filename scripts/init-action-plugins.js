#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPackage = '@lark-apaas/fullstack-cli@latest';
const projectNpmCache = path.join(projectRoot, '.tmp', 'npm-cache');
const initMarkerPath = path.join(
  projectRoot,
  '.tmp',
  'action-plugins-init.json',
);

function getPluginSignature() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  return JSON.stringify(
    Object.entries(packageJson.actionPlugins || {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function isPluginInitCurrent() {
  if (!fs.existsSync(initMarkerPath)) return false;
  try {
    const marker = JSON.parse(fs.readFileSync(initMarkerPath, 'utf8'));
    return marker.signature === getPluginSignature();
  } catch {
    return false;
  }
}

function writePluginInitMarker() {
  fs.mkdirSync(path.dirname(initMarkerPath), { recursive: true });
  fs.writeFileSync(
    initMarkerPath,
    `${JSON.stringify({ signature: getPluginSignature() }, null, 2)}\n`,
    'utf8',
  );
}

function runNpx() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    command,
    ['--cache', projectNpmCache, '-y', cliPackage, 'action-plugin', 'init'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      windowsHide: process.platform === 'win32',
    },
  );
  return result.status ?? 1;
}

function findCachedCli() {
  if (process.platform !== 'win32') return undefined;
  const localAppData = process.env.LOCALAPPDATA;
  const npxRoots = [
    path.join(projectNpmCache, '_npx'),
    ...(localAppData ? [path.join(localAppData, 'npm-cache', '_npx')] : []),
  ];
  const candidates = npxRoots.flatMap((npxRoot) => {
    if (!fs.existsSync(npxRoot)) return [];
    return fs
      .readdirSync(npxRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        path.join(
          npxRoot,
          entry.name,
          'node_modules',
          '@lark-apaas',
          'fullstack-cli',
          'dist',
          'index.js',
        ),
      )
      .filter((candidate) => fs.existsSync(candidate));
  });
  candidates.sort(
    (left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs,
  );

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

if (isPluginInitCurrent()) {
  process.stdout.write('[action-plugin] 配置未变化，跳过重复初始化\n');
  process.exitCode = 0;
} else {
  const initialStatus = runNpx();
  let finalStatus = initialStatus;
  if (initialStatus !== 0 && process.platform === 'win32') {
    const cachedCli = findCachedCli();
    finalStatus = cachedCli ? runWindowsEsmFallback(cachedCli) : initialStatus;
  }
  if (finalStatus === 0) writePluginInitMarker();
  process.exitCode = finalStatus;
}
