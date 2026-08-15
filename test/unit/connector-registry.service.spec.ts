import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectorRegistryService } from '../../server/modules/connectors/connector-registry.service';

describe('connector registry service', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'connector-registry-'));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('defaults to an active, ready local connector without any config', async () => {
    const service = new ConnectorRegistryService(baseDir);
    const settings = await service.getSettings();
    expect(settings.activeConnector).toBe('local');
    const local = settings.items.find((item) => item.type === 'local');
    expect(local?.status).toBe('ready');
    expect(local?.configured).toBe(true);
    await expect(service.getActiveConnector()).resolves.toBe('local');
    await expect(service.isActiveConnectorReady()).resolves.toBe(true);
  });

  it('rejects switching to an unconfigured Feishu connector', async () => {
    const service = new ConnectorRegistryService(baseDir);
    await expect(service.setActive('feishu')).rejects.toThrow();
  });

  it('exposes exactly one enabled output connector after selection changes', async () => {
    const service = new ConnectorRegistryService(baseDir);
    await service.update('dingtalk', {
      clientId: 'app',
      clientSecret: 'secret',
    });
    await service.setActive('dingtalk');

    const settings = await service.getSettings();
    const enabledOutputs = settings.items
      .filter((item) => item.enabled)
      .map((item) => item.type);
    const local = settings.items.find((item) => item.type === 'local');
    expect(enabledOutputs).toEqual(['dingtalk']);
    expect(local?.status).toBe('ready');
  });
});
