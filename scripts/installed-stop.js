#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRoot = path.resolve(
  process.env.WORKBENCH_APP_ROOT || path.resolve(__dirname, '..'),
);
process.env.WORKBENCH_APP_ROOT = appRoot;
process.env.WORKBENCH_INSTALLED = '1';
if (!process.env.WORKBENCH_HOME) {
  process.env.WORKBENCH_HOME = path.join(
    process.env.LOCALAPPDATA || appRoot,
    'MediaNotesWorkbench',
  );
}
const { applyRuntimePathEnvironment } = require('./runtime-paths.js');
const runtimePaths = applyRuntimePathEnvironment(process.env, {
  cwd: appRoot,
});
const runtimeNode = path.join(appRoot, 'runtime', 'node.exe');
const stopScript = path.join(appRoot, 'scripts', 'stop.js');

const result = spawnSync(runtimeNode, [stopScript], {
  cwd: appRoot,
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    WORKBENCH_APP_ROOT: appRoot,
    LOG_DIR: runtimePaths.logDir,
    WORKBENCH_CACHE_DIR: runtimePaths.cacheDir,
    WORKBENCH_CONFIG_DIR: runtimePaths.configDir,
    WORKBENCH_DATA_DIR: runtimePaths.dataDir,
    WORKBENCH_HOME: runtimePaths.homeDir,
    WORKBENCH_INSTALLED: '1',
    WORKBENCH_STATE_DIR: runtimePaths.stateDir,
  },
});

process.exitCode = result.status ?? 1;
