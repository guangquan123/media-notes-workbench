import { join } from 'node:path';

const {
  installPgliteRenameFallback,
  isWithinDirectory,
} = require('../../scripts/pglite-windows-fs.js');

describe('PGlite Windows filesystem compatibility', () => {
  it('limits the fallback to paths within the PGlite data directory', () => {
    const root = join('C:', 'data', 'pgdata');
    expect(isWithinDirectory(join(root, 'pg_logical', 'checkpoint'), root)).toBe(true);
    expect(isWithinDirectory(join('C:', 'data', 'outside'), root)).toBe(false);
  });

  it('uses copy-and-remove only for an EBADF rename inside PGlite data', () => {
    const calls: string[][] = [];
    const failure = Object.assign(new Error('bad file descriptor'), {
      code: 'EBADF',
    });
    const fileSystem = {
      renameSync: jest.fn(() => {
        throw failure;
      }),
      copyFileSync: jest.fn((source, destination) =>
        calls.push(['copy', source, destination]),
      ),
      unlinkSync: jest.fn((source) => calls.push(['unlink', source])),
    };
    const root = join('C:', 'data', 'pgdata');
    expect(
      installPgliteRenameFallback(root, { fileSystem, platform: 'win32' }),
    ).toBe(true);

    fileSystem.renameSync(
      join(root, 'pg_logical', 'replorigin_checkpoint.tmp'),
      join(root, 'pg_logical', 'replorigin_checkpoint'),
    );

    expect(calls).toEqual([
      [
        'copy',
        join(root, 'pg_logical', 'replorigin_checkpoint.tmp'),
        join(root, 'pg_logical', 'replorigin_checkpoint'),
      ],
      ['unlink', join(root, 'pg_logical', 'replorigin_checkpoint.tmp')],
    ]);
  });

  it('does not swallow an EBADF rename outside PGlite data', () => {
    const failure = Object.assign(new Error('bad file descriptor'), {
      code: 'EBADF',
    });
    const fileSystem = {
      renameSync: jest.fn(() => {
        throw failure;
      }),
      copyFileSync: jest.fn(),
      unlinkSync: jest.fn(),
    };
    const root = join('C:', 'data', 'pgdata');
    installPgliteRenameFallback(root, { fileSystem, platform: 'win32' });

    expect(() =>
      fileSystem.renameSync(join('C:', 'data', 'other.tmp'), join('C:', 'data', 'other')),
    ).toThrow(failure);
    expect(fileSystem.copyFileSync).not.toHaveBeenCalled();
  });
});
