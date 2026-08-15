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

  it('does not allow disabling the connector currently in use', async () => {
    const service = new ConnectorRegistryService(baseDir);
    await service.update('dingtalk', {
      clientId: 'app',
      clientSecret: 'secret',
      enabled: true,
    });
    await service.setActive('dingtalk');

    await expect(
      service.update('dingtalk', { enabled: false }),
    ).rejects.toThrow('当前使用的连接器不能关闭');

    const settings = await service.update('local', { enabled: false });
    const local = settings.items.find((item) => item.type === 'local');
    expect(local?.enabled).toBe(false);
    expect(local?.status).toBe('disabled');
  });
});
