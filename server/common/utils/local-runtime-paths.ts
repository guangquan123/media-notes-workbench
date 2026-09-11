import { join, resolve } from 'node:path';

/**
 * Installed Windows builds keep mutable customer state outside the application
 * directory. Development keeps the existing repository-relative locations.
 */
export function getLocalDataDir(): string {
  return resolve(process.env.WORKBENCH_DATA_DIR || join(process.cwd(), 'data'));
}

export function getLocalConfigDir(): string {
  return resolve(process.env.WORKBENCH_CONFIG_DIR || process.cwd());
}

export function getLocalStateDir(): string {
  return resolve(
    process.env.WORKBENCH_STATE_DIR || join(process.cwd(), 'pids'),
  );
}

export function getLocalConfigPath(fileName: string): string {
  return join(getLocalConfigDir(), fileName);
}
