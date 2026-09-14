#!/usr/bin/env node
'use strict';

const path = require('node:path');

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
const { readLauncherEndpoint } = require('./launcher-endpoint.js');
const activeEndpoint = readLauncherEndpoint(runtimePaths.stateDir);
const runtimeNode = path.join(appRoot, 'runtime', 'node.exe');
process.env.LOG_DIR = runtimePaths.logDir;
process.env.WORKBENCH_CACHE_DIR = runtimePaths.cacheDir;
process.env.WORKBENCH_CONFIG_DIR = runtimePaths.configDir;
process.env.WORKBENCH_DATA_DIR = runtimePaths.dataDir;
process.env.WORKBENCH_HOME = runtimePaths.homeDir;
process.env.WORKBENCH_RUNTIME_NODE = runtimeNode;
process.env.WORKBENCH_STATE_DIR = runtimePaths.stateDir;
if (activeEndpoint) {
  process.env.CLIENT_DEV_HOST = activeEndpoint.clientHost;
  process.env.CLIENT_DEV_PORT = String(activeEndpoint.clientPort);
}

require('./stop.js');
