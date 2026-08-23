import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectorRegistryService } from '../../server/modules/connectors/connector-registry.service';
import { RuntimeRegistryService } from '../../server/modules/runtime/runtime.registry.service';
import { validateMediaDownloadUrl } from '../../server/modules/note-jobs/note-jobs.utils';

describe('Windows local runtime with external connectors', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'local-scenarios-'));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('keeps the local runtime while requiring Feishu or DingTalk for output', async () => {
    const registry = new ConnectorRegistryService(baseDir);
    const settings = await registry.getSettings();

    expect(settings.activeConnector).toBe('feishu');
    expect(settings.items.map((item) => item.type)).toEqual(['feishu', 'dingtalk']);
    expect(settings.items.every((item) => item.status === 'unconfigured')).toBe(true);
  });

  it('configures DingTalk executor and switches the active connector', async () => {
    const registry = new ConnectorRegistryService(baseDir);
    await registry.update('dingtalk', {
      clientId: 'app',
      clientSecret: 'secret',
      userId: '643816303',
      webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=x',
    });
    const settings = await registry.setActive('dingtalk');

    expect(settings.activeConnector).toBe('dingtalk');
    expect(settings.items.filter((item) => item.enabled).map((item) => item.type)).toEqual(['dingtalk']);
    await expect(registry.getActiveConfig()).resolves.toMatchObject({
      type: 'dingtalk',
      userId: '643816303',
    });
  });

  it('reports the Windows local runtime when configured', async () => {
    const configPath = join(baseDir, '.runtime-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        mode: 'local',
        database: { kind: 'sqlite' },
        auth: { kind: 'local', ownerId: 'owner-1' },
        ai: { provider: 'external' },
        storage: { kind: 'local' },
      }),
      'utf8',
    );

    const runtime = new RuntimeRegistryService(configPath);
    const status = await runtime.getStatus();
    expect(status.mode).toBe('local');
    expect(status.database).toBe('local');
    expect(status.ai).toBe('external');
  });

  it('allows the local runtime upload URL and remote HTTPS media URLs', () => {
    expect(() =>
      validateMediaDownloadUrl('http://localhost:3000/api/local-uploads/x'),
    ).not.toThrow();
    expect(() =>
      validateMediaDownloadUrl('https://example.com/file.mp4'),
    ).not.toThrow();
  });
});
