import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  findAvailablePort,
  readLauncherEndpoint,
  writeLauncherEndpoint,
} = require('../../scripts/launcher-endpoint.js');

describe('launcher endpoint state', () => {
  it('persists a valid dynamic client endpoint for later launcher actions', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'media-notes-launcher-'));
    try {
      expect(
        writeLauncherEndpoint(stateDir, {
          clientHost: '127.0.0.1',
          clientPort: 8082,
          clientBasePath: '/',
        }),
      ).toEqual({
        clientHost: '127.0.0.1',
        clientPort: 8082,
        clientBasePath: '',
      });
      expect(readLauncherEndpoint(stateDir)).toEqual({
        clientHost: '127.0.0.1',
        clientPort: 8082,
        clientBasePath: '',
      });
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('chooses a different loopback port when the preferred one is occupied', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    const occupiedPort = typeof address === 'object' && address ? address.port : 0;
    try {
      const selected = await findAvailablePort({
        host: '127.0.0.1',
        preferredPort: occupiedPort,
        attempts: 20,
      });
      expect(selected).not.toBe(occupiedPort);
      expect(selected).toBeGreaterThan(occupiedPort);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
