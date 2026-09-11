#!/usr/bin/env node
'use strict';

const path = require('node:path');

function resolveRuntimePaths(options = {}) {
  const environment = options.env || process.env;
  const currentDirectory = options.cwd || process.cwd();
  const appRoot = path.resolve(
    environment.WORKBENCH_APP_ROOT || currentDirectory,
  );
  const installed = environment.WORKBENCH_INSTALLED === '1';
  const configuredHome = environment.WORKBENCH_HOME;
  const homeDir = configuredHome
    ? path.resolve(configuredHome)
    : installed
      ? path.resolve(
          environment.LOCALAPPDATA || appRoot,
          'MediaNotesWorkbench',
        )
      : appRoot;
  const usesSeparatedHome = Boolean(configuredHome) || installed;

  return {
    appRoot,
    cacheDir: path.resolve(
      environment.WORKBENCH_CACHE_DIR ||
        (usesSeparatedHome ? path.join(homeDir, 'cache') : path.join(appRoot, '.tmp')),
    ),
    configDir: path.resolve(
      environment.WORKBENCH_CONFIG_DIR ||
        (usesSeparatedHome ? path.join(homeDir, 'config') : appRoot),
    ),
    dataDir: path.resolve(
      environment.WORKBENCH_DATA_DIR ||
        (usesSeparatedHome ? path.join(homeDir, 'data') : path.join(appRoot, 'data')),
    ),
    homeDir,
    logDir: path.resolve(
      environment.LOG_DIR ||
        (usesSeparatedHome ? path.join(homeDir, 'logs') : path.join(appRoot, 'logs')),
    ),
    stateDir: path.resolve(
      environment.WORKBENCH_STATE_DIR ||
        (usesSeparatedHome ? path.join(homeDir, 'runtime') : path.join(appRoot, 'pids')),
    ),
  };
}

function applyRuntimePathEnvironment(environment = process.env, options = {}) {
  const paths = resolveRuntimePaths({ env: environment, ...options });
  environment.WORKBENCH_APP_ROOT = paths.appRoot;
  environment.WORKBENCH_HOME = paths.homeDir;
  environment.WORKBENCH_CACHE_DIR = paths.cacheDir;
  environment.WORKBENCH_CONFIG_DIR = paths.configDir;
  environment.WORKBENCH_DATA_DIR = paths.dataDir;
  environment.LOG_DIR = paths.logDir;
  environment.WORKBENCH_STATE_DIR = paths.stateDir;
  return paths;
}

module.exports = {
  applyRuntimePathEnvironment,
  resolveRuntimePaths,
};
