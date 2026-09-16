import {
  findModelProviderPreset,
  inferModelProviderPresetId,
  MODEL_PROVIDER_PRESETS,
  type ModelProviderPreset,
} from '../../client/src/lib/model-provider-presets';

describe('model provider presets', () => {
  it('includes the supported mainstream providers and a custom fallback', () => {
    const presetIds: string[] = MODEL_PROVIDER_PRESETS.map(
      (preset: ModelProviderPreset): string => preset.id,
    );

    expect(presetIds).toEqual(
      expect.arrayContaining([
        'deepseek',
        'qwen',
        'zhipu',
        'doubao',
        'kimi',
        'hunyuan',
        'siliconflow',
        'ollama',
        'custom',
      ]),
    );
  });

  it('prefills the official Kimi K3 compatible endpoint', () => {
    expect(findModelProviderPreset('kimi')).toEqual(
      expect.objectContaining({
        baseUrl: 'https://api.moonshot.cn/v1',
        name: 'Kimi（K3）',
      }),
    );
  });

  it('falls back to custom for an unsupported endpoint', () => {
    expect(inferModelProviderPresetId('https://models.example.com/v1')).toBe(
      'custom',
    );
  });

  it('recognizes preset endpoints with a trailing slash', () => {
    expect(inferModelProviderPresetId('https://api.moonshot.cn/v1/')).toBe(
      'kimi',
    );
  });
});
