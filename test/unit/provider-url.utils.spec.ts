import { analyzeProviderUrl, normalizeProviderUrl } from '../../server/modules/setup/provider-url.utils';

describe('provider url analysis', () => {
  it('normalizes concrete OpenAI-compatible endpoints with confirmation', () => {
    expect(analyzeProviderUrl('https://example.com/v1/chat/completions')).toEqual({
      changed: true,
      message: '检测到你填写的是具体接口地址，建议改为服务根地址。',
      normalizedUrl: 'https://example.com/v1',
      requiresConfirmation: true,
      valid: true,
    });
  });

  it('normalizes trailing slash without forcing a confirmation dialog', () => {
    expect(analyzeProviderUrl('https://example.com/v1/')).toEqual({
      changed: true,
      normalizedUrl: 'https://example.com/v1',
      requiresConfirmation: false,
      valid: true,
    });
    expect(normalizeProviderUrl('https://example.com/v1/')).toBe(
      'https://example.com/v1',
    );
  });

  it('rejects unsafe protocols and embedded credentials', () => {
    expect(analyzeProviderUrl('file:///tmp/models').valid).toBe(false);
    expect(analyzeProviderUrl('https://user:pass@example.com/v1').valid).toBe(false);
  });
});
