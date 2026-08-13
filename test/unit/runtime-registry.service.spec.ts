import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeRuntimeConfig } from '../../server/modules/runtime/runtime.config';
import { RuntimeRegistryService } from '../../server/modules/runtime/runtime.registry.service';

describe('runtime registry', () => {
  it('defaults to miaoda platform providers when no config exists', async () => {
    const service = new RuntimeRegistryService(join(tmpdir(), "missing-runtime-config.json"));
    await expect(service.getMode()).resolves.toBe('miaoda');
    await expect(service.isLocal()).resolves.toBe(false);
    const status = await service.getStatus();
    expect(status.mode).toBe('miaoda');
    expect(status.database).toBe('platform');
    expect(status.ai).toBe('builtin');
  });

  it('normalizes a local runtime config', () => {
    const cfg = normalizeRuntimeConfig({ mode: 'local', database: { kind: 'sqlite', file: 'data/db.sqlite' }, auth: { kind: 'local', ownerId: 'owner-1' }, ai: { provider: 'external' }, storage: { kind: 'local' } });
    expect(cfg.mode).toBe('local');
    expect(cfg.database.kind).toBe('sqlite');
    expect(cfg.auth.kind).toBe('local');
    expect(cfg.ai.provider).toBe('external');
    expect(cfg.storage.kind).toBe('local');
  });

  it('loads a local config file and reports local status', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "runtime-"));
    const configPath = join(baseDir, ".runtime-config.json");
    try {
      await writeFile(configPath, JSON.stringify({ mode: 'local', database: { kind: 'sqlite' }, auth: { kind: 'local' }, ai: { provider: 'external' }, storage: { kind: 'local' } }), 'utf8');
      const service = new RuntimeRegistryService(configPath);
      await expect(service.getMode()).resolves.toBe('local');
      const status = await service.getStatus();
      expect(status.database).toBe('local');
      expect(status.ai).toBe('external');
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
