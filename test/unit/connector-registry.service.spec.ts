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

  it('defaults to Feishu and requires an external connector configuration', async () => {
    const service = new ConnectorRegistryService(baseDir);
    const settings = await service.getSettings();
    expect(settings.activeConnector).toBe('feishu');
    expect(settings.items.map((item) => item.type)).toEqual(['feishu', 'dingtalk']);
    expect(settings.items.find((item) => item.type === 'feishu')?.status).toBe('unconfigured');
    await expect(service.getActiveConnector()).resolves.toBe('feishu');
    await expect(service.isActiveConnectorReady()).resolves.toBe(false);
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
    expect(enabledOutputs).toEqual(['dingtalk']);
  });

  it('stores the authorized DingTalk user as the task executor and returns it to the settings page', async () => {
    const service = new ConnectorRegistryService(baseDir);

    await service.setDingTalkTaskExecutorUserId('ding-user-123');

    await expect(service.getActiveConfig()).resolves.toMatchObject({
      type: 'feishu',
    });
    const settings = await service.getSettings();
    expect(
      settings.items.find((item) => item.type === 'dingtalk')
        ?.taskExecutorUserId,
    ).toBe('ding-user-123');
  });

  it('stores at most one webhook per connector and clears it explicitly', async () => {
    const service = new ConnectorRegistryService(baseDir);
    await service.update('feishu', {
      webhookSecret: 'secret-1',
      webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/first',
    });
    await service.update('feishu', {
      webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/replaced',
    });
    await expect(service.getConfig('feishu')).resolves.toMatchObject({
      webhookSecret: 'secret-1',
      webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/replaced',
    });

    await service.update('feishu', { clearWebhook: true });
    await expect(service.getConfig('feishu')).resolves.toMatchObject({
      webhookSecret: '',
      webhookUrl: '',
    });
  });
});
