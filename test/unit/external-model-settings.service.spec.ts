import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExternalModelSettingsService } from '../../server/modules/note-jobs/external-model-settings.service';
import { ModelProviderSettingsService } from '../../server/modules/note-jobs/model-provider-settings.service';
import {
  getExternalModelBalanceEndpoint,
  getExternalModelProvider,
  parseExternalModelBalance,
} from '../../server/modules/note-jobs/external-model-balance.utils';

describe('external model settings', () => {
  it('prefers the unified provider model for LLM credentials', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'external-model-settings-'));
    try {
      const providerSettings = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      const provider = await providerSettings.createProvider({
        apiKey: 'unified-key',
        baseUrl: 'https://models.example.com/v1',
        enabled: true,
        name: '统一模型服务',
      });
      await providerSettings.updateModelSettings({
        summaryModel: {
          model: 'summary-model',
          providerId: provider.id,
          providerName: provider.name,
        },
        transcriptionMode: 'tencent_asr',
      });

      const service = new ExternalModelSettingsService(
        join(baseDir, '.external-model-config.json'),
        providerSettings,
      );

      await expect(service.getCredentials()).resolves.toEqual(
        expect.objectContaining({
          apiKey: 'unified-key',
          baseUrl: 'https://models.example.com/v1',
          model: 'summary-model',
          providerName: '统一模型服务',
        }),
      );
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

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

  it('supports an explicit balance endpoint only for DeepSeek-compatible hosts', () => {
    expect(getExternalModelBalanceEndpoint('https://api.deepseek.com/v1')).toBe(
      'https://api.deepseek.com/user/balance',
    );
    expect(getExternalModelBalanceEndpoint('https://model.example.com/v1')).toBeNull();
    expect(getExternalModelBalanceEndpoint('https://deepseek.com.attacker.test/v1')).toBeNull();
    expect(getExternalModelProvider('not-a-url')).toBe('not-a-url');
  });

  it('parses provider balance data without inventing a value', () => {
    expect(parseExternalModelBalance({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '12.50' }],
    })).toEqual({ available: true, currency: 'CNY', totalBalance: '12.50' });
    expect(parseExternalModelBalance({ is_available: false, balance_infos: [] })).toEqual({
      available: false,
      currency: null,
      totalBalance: null,
    });
  });

  it('reads the official DeepSeek balance endpoint', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'external-model-settings-'));
    const configPath = join(baseDir, '.external-model-config.json');
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      await writeFile(configPath, JSON.stringify({
        apiKey: 'test-key',
        baseUrl: 'https://api.deepseek.com/v1',
        enabled: true,
        model: 'deepseek-chat',
      }), 'utf8');
      fetchSpy.mockResolvedValue({
        json: async (): Promise<Record<string, unknown>> => ({
          balance_infos: [{ currency: 'CNY', total_balance: '8.00' }],
          is_available: true,
        }),
        ok: true,
        status: 200,
      } as Response);

      const service = new ExternalModelSettingsService(configPath);
      await expect(service.getQuotaStatus()).resolves.toEqual(expect.objectContaining({
        currency: 'CNY',
        status: 'available',
        totalBalance: '8.00',
      }));
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/user/balance');
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});
