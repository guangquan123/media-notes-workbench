import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectorRegistryService } from '../../server/modules/connectors/connector-registry.service';
import { RuntimeRegistryService } from '../../server/modules/runtime/runtime.registry.service';
import { LocalDocumentService } from '../../server/modules/connectors/local-document.service';
import { validateMediaDownloadUrl } from '../../server/modules/note-jobs/note-jobs.utils';

describe('local-mode end-to-end scenarios', () => {
  let baseDir: string;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'local-scenarios-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('defaults to a ready local connector with no external identity', async () => {
    const registry = new ConnectorRegistryService(baseDir);
    const settings = await registry.getSettings();
    expect(settings.activeConnector).toBe('local');
    const local = settings.items.find((item) => item.type === 'local');
    expect(local?.status).toBe('ready');
    expect(local?.capabilities).toContain('document.write');
    expect(local?.capabilities).toContain('notification.send');
    const config = await registry.getActiveConfig();
    expect(config.type).toBe('local');
    expect(config.userId).toBe('');
  });

  it('configures DingTalk executor and switches the active connector', async () => {
    const registry = new ConnectorRegistryService(baseDir);
    await registry.update('dingtalk', { enabled: true, clientId: 'app', clientSecret: 'secret', userId: '643816303', webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=x' });
    let settings = await registry.getSettings();
    const dingtalk = settings.items.find((item) => item.type === 'dingtalk');
    expect(dingtalk?.configured).toBe(true);
    settings = await registry.setActive("dingtalk");
    expect(settings.activeConnector).toBe('dingtalk');
    const config = await registry.getActiveConfig();
    expect(config.userId).toBe('643816303');
  });

  it('rejects switching to an unconfigured Feishu connector', async () => {
    const registry = new ConnectorRegistryService(baseDir);
    await expect(registry.setActive('feishu')).rejects.toThrow();
  });

  it('persists and reads a local markdown document', async () => {
    const docs = new LocalDocumentService(baseDir);
    const created = await docs.create('测试笔记', '# 内容\n\n正文');
    expect(created.url).toContain('/api/connectors/local/documents/');
    const markdown = await docs.read(created.documentId);
    expect(markdown).toContain('# 测试笔记');
    expect(markdown).toContain('正文');
  });

  it('reports miaoda runtime by default', async () => {
    const runtime = new RuntimeRegistryService(join(baseDir, ".runtime-config.json"));
    await expect(runtime.getMode()).resolves.toBe('miaoda');
    await expect(runtime.isLocal()).resolves.toBe(false);
    const status = await runtime.getStatus();
    expect(status.mode).toBe('miaoda');
    expect(status.database).toBe('platform');
    expect(status.ai).toBe('builtin');
  });

  it('reports local runtime when configured', async () => {
    const configPath = join(baseDir, ".runtime-config.json");
    await writeFile(configPath, JSON.stringify({ mode: 'local', database: { kind: 'sqlite' }, auth: { kind: 'local', ownerId: 'owner-1' }, ai: { provider: 'external' }, storage: { kind: 'local' } }), 'utf8');
    const runtime = new RuntimeRegistryService(configPath);
    await expect(runtime.getMode()).resolves.toBe('local');
    const status = await runtime.getStatus();
    expect(status.database).toBe('local');
    expect(status.ai).toBe('external');
    expect(status.auth).toBe('local');
  });

  it('accepts only https URLs in miaoda mode', () => {
    expect(() => validateMediaDownloadUrl('http://localhost:3000/api/local-uploads/x')).toThrow();
    expect(() => validateMediaDownloadUrl('https://example.com/file.mp4')).not.toThrow();
    expect(() => validateMediaDownloadUrl('https://169.254.1.1/file')).toThrow();
  });
});
