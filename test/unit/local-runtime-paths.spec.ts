import { resolve } from 'node:path';
import { getLocalRuntimePaths } from '../../server/common/utils/local-runtime-paths';

describe('local runtime paths', () => {
  it('keeps the legacy repository layout when no home is configured', () => {
    const previous = { ...process.env };
    try {
      delete process.env.WORKBENCH_HOME;
      delete process.env.WORKBENCH_INSTALLED;
      delete process.env.LOCALAPPDATA;
      delete process.env.WORKBENCH_DATA_DIR;
      delete process.env.WORKBENCH_CONFIG_DIR;
      delete process.env.WORKBENCH_CACHE_DIR;
      delete process.env.LOG_DIR;
      delete process.env.WORKBENCH_STATE_DIR;
      process.env.WORKBENCH_APP_ROOT = resolve('C:/workbench');

      expect(getLocalRuntimePaths()).toEqual({
        appRoot: resolve('C:/workbench'),
        cacheDir: resolve('C:/workbench/.tmp'),
        configDir: resolve('C:/workbench'),
        dataDir: resolve('C:/workbench/data'),
        homeDir: resolve('C:/workbench'),
        logDir: resolve('C:/workbench/logs'),
        stateDir: resolve('C:/workbench/pids'),
      });
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, previous);
    }
  });

  it('derives separated directories from WORKBENCH_HOME while honoring overrides', () => {
    const previous = { ...process.env };
    try {
      process.env.WORKBENCH_APP_ROOT = resolve('C:/workbench');
      process.env.WORKBENCH_HOME = resolve('C:/runtime/media-notes');
      delete process.env.WORKBENCH_INSTALLED;
      delete process.env.WORKBENCH_DATA_DIR;
      delete process.env.WORKBENCH_CONFIG_DIR;
      delete process.env.WORKBENCH_CACHE_DIR;
      delete process.env.LOG_DIR;
      delete process.env.WORKBENCH_STATE_DIR;

      expect(getLocalRuntimePaths()).toMatchObject({
        cacheDir: resolve('C:/runtime/media-notes/cache'),
        configDir: resolve('C:/runtime/media-notes/config'),
        dataDir: resolve('C:/runtime/media-notes/data'),
        homeDir: resolve('C:/runtime/media-notes'),
        logDir: resolve('C:/runtime/media-notes/logs'),
        stateDir: resolve('C:/runtime/media-notes/runtime'),
      });

      process.env.WORKBENCH_DATA_DIR = resolve('D:/records');
      expect(getLocalRuntimePaths().dataDir).toBe(resolve('D:/records'));
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, previous);
    }
  });

  it('uses the installed product home when the launcher marks the process as installed', () => {
    const previous = { ...process.env };
    try {
      process.env.WORKBENCH_APP_ROOT = resolve('D:/Program Files/MediaNotesWorkbench');
      process.env.LOCALAPPDATA = resolve('C:/Users/test/AppData/Local');
      process.env.WORKBENCH_INSTALLED = '1';
      delete process.env.WORKBENCH_HOME;
      delete process.env.WORKBENCH_DATA_DIR;
      delete process.env.WORKBENCH_CONFIG_DIR;
      delete process.env.WORKBENCH_CACHE_DIR;
      delete process.env.LOG_DIR;
      delete process.env.WORKBENCH_STATE_DIR;

      expect(getLocalRuntimePaths()).toMatchObject({
        homeDir: resolve('C:/Users/test/AppData/Local/MediaNotesWorkbench'),
        dataDir: resolve('C:/Users/test/AppData/Local/MediaNotesWorkbench/data'),
        configDir: resolve('C:/Users/test/AppData/Local/MediaNotesWorkbench/config'),
        cacheDir: resolve('C:/Users/test/AppData/Local/MediaNotesWorkbench/cache'),
        logDir: resolve('C:/Users/test/AppData/Local/MediaNotesWorkbench/logs'),
        stateDir: resolve('C:/Users/test/AppData/Local/MediaNotesWorkbench/runtime'),
      });
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, previous);
    }
  });
});
