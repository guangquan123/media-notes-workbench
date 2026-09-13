import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelProviderSettingsService } from '../../server/modules/note-jobs/model-provider-settings.service';
import type { ModelServiceProvider } from '../../shared/api.interface';

describe('model provider settings', () => {
  it('stores providers without exposing API keys and validates model references', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'model-provider-settings-'));
    try {
      const service = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      const provider = await service.createProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://models.example.com/v1/',
        enabled: true,
        name: '测试 Provider',
      });

      expect(provider.apiKeyConfigured).toBe(true);
      expect(provider.baseUrl).toBe('https://models.example.com/v1');
      expect(JSON.stringify(provider)).not.toContain('secret-key');

      const settings = await service.updateModelSettings({
        summaryModel: {
          model: 'qwen-plus',
          providerId: provider.id,
          providerName: provider.name,
        },
        transcriptionMode: 'custom_api',
        transcriptionModel: {
          model: 'paraformer-v2',
          providerId: provider.id,
          providerName: provider.name,
        },
      });
      expect(settings.transcriptionMode).toBe('custom_api');
      expect(settings.transcriptionModel?.model).toBe('paraformer-v2');
      await expect(service.getCredentials('llm')).resolves.toEqual(
        expect.objectContaining({
          apiKey: 'secret-key',
          baseUrl: 'https://models.example.com/v1',
          model: 'qwen-plus',
          providerName: '测试 Provider',
        }),
      );
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('refreshes OpenAI-compatible model lists and filters by capability', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'model-provider-settings-'));
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      const service = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      const provider = await service.createProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://models.example.com/v1',
        enabled: true,
        name: '测试 Provider',
      });
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(service.listModels(provider.id, 'transcription')).resolves.toEqual({
        items: [
          { capabilities: ['transcription'], id: 'model-a' },
          { capabilities: ['transcription'], id: 'model-b' },
        ],
        providerId: provider.id,
      });
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'model-c' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await expect(service.listModels(provider.id, 'llm')).resolves.toEqual({
        items: [{ capabilities: ['llm'], id: 'model-c' }],
        providerId: provider.id,
      });
      const persisted = await service.getPublicSettings();
      const persistedProvider = persisted.providers.find(
        (item: ModelServiceProvider): boolean => item.id === provider.id,
      );
      expect(persistedProvider?.models).toEqual([
        { capabilities: ['transcription'], id: 'model-a' },
        { capabilities: ['transcription'], id: 'model-b' },
        { capabilities: ['llm'], id: 'model-c' },
      ]);
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(
        'https://models.example.com/v1/models',
      );
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('tests provider connectivity through the models endpoint', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'model-provider-settings-'));
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      const service = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      const provider = await service.createProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://models.example.com/v1',
        enabled: true,
        name: '测试 Provider',
      });
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(service.testConnection(provider.id)).resolves.toEqual(
        expect.objectContaining({
          message: '连接成功，已读取 1 个模型。',
          providerId: provider.id,
          status: 'success',
        }),
      );
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(
        'https://models.example.com/v1/models',
      );
      const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect(request.headers).toEqual({ Authorization: 'Bearer secret-key' });
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('uses a real minimal completion request to validate a manually selected summary model', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'model-provider-settings-'));
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      const service = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      const provider = await service.createProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://models.example.com/v1',
        enabled: true,
        name: '测试 Provider',
      });
      await service.updateModelSettings({
        summaryModel: {
          model: 'manual-model',
          providerId: provider.id,
          providerName: provider.name,
        },
        transcriptionMode: 'tencent_asr',
      });
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' } }],
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          },
        ),
      );

      await expect(
        service.validateSummaryModel(provider.id, 'manual-model'),
      ).resolves.toEqual(
        expect.objectContaining({
          model: 'manual-model',
          providerId: provider.id,
          status: 'success',
        }),
      );
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(
        'https://models.example.com/v1/chat/completions',
      );
      const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect(request.body).toContain('manual-model');
      expect(request.headers).toEqual({
        Authorization: 'Bearer secret-key',
        'Content-Type': 'application/json',
      });
      await expect(service.getConfigurationFingerprint('llm')).resolves.toMatch(
        /^[a-f0-9]{64}$/u,
      );
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('allows a loopback Ollama provider without an API key', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'model-provider-settings-'));
    try {
      const service = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      const provider = await service.createProvider({
        apiKey: '',
        baseUrl: 'http://127.0.0.1:11434/v1',
        enabled: true,
        name: 'Ollama',
      });
      expect(provider.configured).toBe(true);
      await service.updateModelSettings({
        summaryModel: {
          model: 'ollama-model',
          providerId: provider.id,
          providerName: provider.name,
        },
        transcriptionMode: 'tencent_asr',
      });
      await expect(service.getCredentials('llm')).resolves.toEqual(
        expect.objectContaining({ apiKey: '' }),
      );
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('falls back to the Responses endpoint when chat completions are unavailable', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'model-provider-settings-'));
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      const service = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      const provider = await service.createProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://models.example.com/v1',
        enabled: true,
        name: 'Responses Provider',
      });
      await service.updateModelSettings({
        summaryModel: {
          model: 'responses-model',
          providerId: provider.id,
          providerName: provider.name,
        },
        transcriptionMode: 'tencent_asr',
      });
      fetchSpy
        .mockResolvedValueOnce(new Response('', { status: 404 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ output_text: 'OK' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );

      await expect(
        service.validateSummaryModel(provider.id, 'responses-model'),
      ).resolves.toEqual(expect.objectContaining({ status: 'success' }));
      expect(fetchSpy.mock.calls[1]?.[0]).toBe(
        'https://models.example.com/v1/responses',
      );
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('rejects credentials embedded in a provider URL', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'model-provider-settings-'));
    try {
      const service = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      await expect(
        service.createProvider({
          apiKey: 'secret-key',
          baseUrl: 'https://user:password@models.example.com/v1',
          enabled: true,
          name: 'Invalid URL',
        }),
      ).rejects.toThrow('有效的 HTTP(S) 地址');
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('never reuses a saved API key after the provider address changes', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'model-provider-settings-'));
    try {
      const service = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      const provider = await service.createProvider({
        apiKey: 'old-secret-key',
        baseUrl: 'https://old.example.com/v1',
        enabled: true,
        name: 'Old Provider',
      });

      await expect(
        service.updateProvider(provider.id, {
          baseUrl: 'https://new.example.com/v1',
          enabled: true,
          name: 'New Provider',
        }),
      ).rejects.toThrow('API 地址已变更');

      await expect(
        service.updateProvider(provider.id, {
          baseUrl: 'http://127.0.0.1:11434/v1',
          enabled: true,
          name: 'Local Provider',
        }),
      ).resolves.toEqual(expect.objectContaining({ apiKeyConfigured: false }));
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});
