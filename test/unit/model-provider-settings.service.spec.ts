import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelProviderSettingsService } from '../../server/modules/note-jobs/model-provider-settings.service';

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
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(
        'https://models.example.com/v1/models',
      );
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});
