import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  getPgliteLockPath,
  removeStalePgliteLock,
} = require('../../scripts/pglite-recovery.js');

describe('PGlite recovery', () => {
  it('removes only the stale PGlite lock file and keeps database data intact', () => {
    const dataDir = join(tmpdir(), `media-notes-pglite-${Date.now()}`);
    const lockPath = getPgliteLockPath(dataDir);
    const sentinelPath = join(dataDir, 'pgdata', 'base', 'sentinel');
    try {
      mkdirSync(join(dataDir, 'pgdata', 'base'), { recursive: true });
      writeFileSync(lockPath, '-42\n/pglite/data\n');
      writeFileSync(sentinelPath, 'keep');

      expect(removeStalePgliteLock(dataDir)).toEqual({
        removed: true,
        lockPath,
      });
      expect(removeStalePgliteLock(dataDir)).toEqual({
        removed: false,
        lockPath,
      });
      expect(require('node:fs').readFileSync(sentinelPath, 'utf8')).toBe('keep');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
