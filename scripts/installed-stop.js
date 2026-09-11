#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRoot = path.resolve(
  process.env.WORKBENCH_APP_ROOT || path.resolve(__dirname, '..'),
);
const dataRoot = path.resolve(
  process.env.WORKBENCH_DATA_DIR ||
    path.join(process.env.LOCALAPPDATA || appRoot, 'MediaNotesWorkbench'),
);
const runtimeNode = path.join(appRoot, 'runtime', 'node.exe');
const stopScript = path.join(appRoot, 'scripts', 'stop.js');

const result = spawnSync(runtimeNode, [stopScript], {
  cwd: appRoot,
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    WORKBENCH_APP_ROOT: appRoot,
    WORKBENCH_CONFIG_DIR: path.join(dataRoot, 'config'),
    WORKBENCH_DATA_DIR: dataRoot,
    WORKBENCH_STATE_DIR: path.join(dataRoot, 'runtime-state'),
  },
});

process.exitCode = result.status ?? 1;
