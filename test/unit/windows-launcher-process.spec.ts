import { inspectWindowsLauncherProcess } from '../../scripts/launcher-process.js';

describe('Windows launcher PID ownership inspection', () => {
  const rootDir = 'D:\\data\\codex_space\\media-notes-workbench';

  function inspect(stdout: string, overrides: Record<string, unknown> = {}) {
    return inspectWindowsLauncherProcess(12345, {
      rootDir,
      platform: 'win32',
      env: { SystemRoot: 'C:\\Windows' },
      spawnSync: () => ({ status: 0, stdout, stderr: '' }),
      ...overrides,
    });
  }

  it('accepts only the launcher process from this project', () => {
    expect(
      inspect(
        '"C:\\Program Files\\nodejs\\node.exe" "D:\\data\\codex_space\\media-notes-workbench\\scripts\\dev-windows.js"',
      ),
    ).toEqual({ ownership: 'owned' });
  });

  it('marks a reused PID held by an unrelated process as stale', () => {
    expect(inspect('C:\\Windows\\System32\\SearchIndexer.exe')).toEqual({
      ownership: 'stale',
    });
  });

  it('keeps the PID state unknown when Windows denies process inspection', () => {
    expect(
      inspect('', {
        spawnSync: () => ({
          status: 1,
          stdout: '',
          stderr: 'Access is denied',
        }),
      }),
    ).toEqual({ ownership: 'unknown' });
  });
});
