import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExternalModelSettingsService } from '../../server/modules/note-jobs/external-model-settings.service';

describe('external model settings', () => {
  it('does not treat an unreadable configuration file as an unconfigured model', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'external-model-settings-'));
    const configPath = join(baseDir, '.external-model-config.json');
    try {
      await writeFile(configPath, '{ invalid json', 'utf8');
      const service = new ExternalModelSettingsService(configPath);

      await expect(service.getCredentials()).rejects.toThrow(
        '外部 AI 模型配置文件格式无效',
      );
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('accepts a connection only when the completion endpoint returns usable text', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'external-model-settings-'));
    const configPath = join(baseDir, '.external-model-config.json');
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      await writeFile(
        configPath,
        JSON.stringify({
          apiKey: 'test-key',
          baseUrl: 'https://model.example.com/v1',
          enabled: true,
          model: 'test-model',
        }),
        'utf8',
      );
      const service = new ExternalModelSettingsService(configPath);
      fetchSpy.mockResolvedValue({
        json: async (): Promise<Record<string, unknown>> => ({ choices: [] }),
        ok: true,
        status: 200,
      } as Response);

      await expect(service.testConnection()).rejects.toThrow(
        '模型连通性校验失败：服务未返回可用文本内容',
      );
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('reports a successful completion connection check', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'external-model-settings-'));
    const configPath = join(baseDir, '.external-model-config.json');
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      await writeFile(
        configPath,
        JSON.stringify({
          apiKey: 'test-key',
          baseUrl: 'https://model.example.com/v1',
          enabled: true,
          model: 'test-model',
        }),
        'utf8',
      );
      const service = new ExternalModelSettingsService(configPath);
      fetchSpy.mockResolvedValue({
        json: async (): Promise<Record<string, unknown>> => ({
          choices: [{ message: { content: '连接成功' } }],
        }),
        ok: true,
        status: 200,
      } as Response);

      await expect(service.testConnection()).resolves.toEqual(
        expect.objectContaining({ message: '已验证 test-model 的基础连通性（短请求）；长文本生成遇到瞬时断连时，系统会自动重试。' }),
      );
      const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const requestBody = JSON.parse(String(requestInit.body)) as { max_tokens?: number };
      expect(requestBody.max_tokens).toBe(128);
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});
