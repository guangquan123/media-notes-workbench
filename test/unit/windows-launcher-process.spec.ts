import {
  inspectWindowsLauncherProcess,
  resolveExistingLauncherState,
} from '../../scripts/launcher-process.js';

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

  function inspectWithRuntimeFallback(
    commandLineResult: Record<string, unknown>,
    executablePath: string,
  ) {
    let callCount = 0;
    return inspect('', {
      nodePath: 'C:\\Program Files\\nodejs\\node.exe',
      spawnSync: () => {
        callCount += 1;
        return callCount === 1
          ? commandLineResult
          : { status: 0, stdout: executablePath, stderr: '' };
      },
    });
  }

  it('accepts only the launcher process from this project', () => {
    expect(
      inspect(
        '"C:\\Program Files\\nodejs\\node.exe" "D:\\data\\codex_space\\media-notes-workbench\\scripts\\dev-windows.js"',
      ),
    ).toEqual({ ownership: 'owned' });
  });

  it('accepts the project static client process as an owned process', () => {
    expect(
      inspect(
        '"C:\\Program Files\\nodejs\\node.exe" "D:\\data\\codex_space\\media-notes-workbench\\scripts\\static-client.js"',
      ),
    ).toEqual({ ownership: 'owned' });
  });

  it('accepts a static client command line using the launcher working directory', () => {
    expect(inspect('node scripts/static-client.js')).toEqual({
      ownership: 'owned',
    });
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

  it('recognizes the current Node runtime when command-line inspection is denied', () => {
    expect(
      inspectWithRuntimeFallback(
        { status: 1, stdout: '', stderr: 'Access is denied' },
        'C:\\Program Files\\nodejs\\node.exe',
      ),
    ).toEqual({ ownership: 'unknown', sameRuntime: true });
  });

  it('uses the executable fallback when Windows returns an empty command line', () => {
    expect(
      inspectWithRuntimeFallback(
        { status: 0, stdout: '', stderr: '' },
        'C:\\Program Files\\nodejs\\node.exe',
      ),
    ).toEqual({ ownership: 'unknown', sameRuntime: true });
  });

  it('uses verified service state instead of trusting an unreadable stale PID', () => {
    expect(
      resolveExistingLauncherState({
        ownership: 'unknown',
        pidFileAgeMs: 600_000,
        serviceState: 'unavailable',
      }),
    ).toBe('stale');
    expect(
      resolveExistingLauncherState({
        ownership: 'unknown',
        pidFileAgeMs: 10_000,
        serviceState: 'unavailable',
      }),
    ).toBe('reuse-starting');
    expect(
      resolveExistingLauncherState({
        ownership: 'unknown',
        pidFileAgeMs: 600_000,
        serviceState: 'ready',
      }),
    ).toBe('reuse-ready');
    expect(
      resolveExistingLauncherState({
        ownership: 'unknown',
        pidFileAgeMs: 600_000,
        serviceState: 'unknown',
      }),
    ).toBe('blocked');
  });

  it('does not wait forever for an old owned launcher with an unavailable service', () => {
    expect(
      resolveExistingLauncherState({
        ownership: 'owned',
        pidFileAgeMs: 600_000,
        serviceState: 'unavailable',
      }),
    ).toBe('blocked');
  });
});
