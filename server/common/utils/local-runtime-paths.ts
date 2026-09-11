import { join, resolve } from 'node:path';

export interface LocalRuntimePaths {
  appRoot: string;
  cacheDir: string;
  configDir: string;
  dataDir: string;
  homeDir: string;
  logDir: string;
  stateDir: string;
}

function getApplicationRoot(): string {
  return resolve(process.env.WORKBENCH_APP_ROOT || process.cwd());
}

/**
 * Resolve mutable local runtime paths in one place. Explicit legacy variables
 * remain authoritative so existing launchers and tests can opt into a custom
 * layout without being rewritten at once.
 */
export function getLocalRuntimePaths(): LocalRuntimePaths {
  const appRoot = getApplicationRoot();
  const installed = process.env.WORKBENCH_INSTALLED === '1';
  const configuredHome = process.env.WORKBENCH_HOME;
  const defaultHome = configuredHome
    ? resolve(configuredHome)
    : installed
      ? resolve(
          process.env.LOCALAPPDATA || appRoot,
          'MediaNotesWorkbench',
        )
      : appRoot;
  const usesSeparatedHome = Boolean(configuredHome) || installed;

  return {
    appRoot,
    cacheDir: resolve(
      process.env.WORKBENCH_CACHE_DIR ||
        (usesSeparatedHome ? join(defaultHome, 'cache') : join(appRoot, '.tmp')),
    ),
    configDir: resolve(
      process.env.WORKBENCH_CONFIG_DIR ||
        (usesSeparatedHome ? join(defaultHome, 'config') : appRoot),
    ),
    dataDir: resolve(
      process.env.WORKBENCH_DATA_DIR ||
        (usesSeparatedHome ? join(defaultHome, 'data') : join(appRoot, 'data')),
    ),
    homeDir: defaultHome,
    logDir: resolve(
      process.env.LOG_DIR ||
        (usesSeparatedHome ? join(defaultHome, 'logs') : join(appRoot, 'logs')),
    ),
    stateDir: resolve(
      process.env.WORKBENCH_STATE_DIR ||
        (usesSeparatedHome ? join(defaultHome, 'runtime') : join(appRoot, 'pids')),
    ),
  };
}

export function getLocalDataDir(): string {
  return getLocalRuntimePaths().dataDir;
}

export function getLocalConfigDir(): string {
  return getLocalRuntimePaths().configDir;
}

export function getLocalCacheDir(): string {
  return getLocalRuntimePaths().cacheDir;
}

export function getLocalLogDir(): string {
  return getLocalRuntimePaths().logDir;
}

export function getLocalStateDir(): string {
  return getLocalRuntimePaths().stateDir;
}

export function getLocalConfigPath(fileName: string): string {
  return join(getLocalConfigDir(), fileName);
}
