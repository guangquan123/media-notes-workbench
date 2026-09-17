import { buildAiModelReadinessSummary } from '../../client/src/pages/AiModelSettingsPage/ai-model-readiness.utils';
import type {
  AiModelSettings,
  SystemReadiness,
} from '../../shared/api.interface';

const PROVIDER = {
  apiKeyConfigured: true,
  baseUrl: 'https://models.example.com/v1',
  configured: true,
  enabled: true,
  id: 'provider-1',
  models: [],
  name: 'Provider',
};

const SETTINGS: AiModelSettings = {
  providers: [PROVIDER],
  summaryModel: {
    model: 'summary-model',
    providerId: PROVIDER.id,
    providerName: PROVIDER.name,
  },
  transcriptionMode: 'tencent_asr',
};

const READINESS: SystemReadiness = {
  connectorReady: true,
  documentReady: true,
  ffmpeg: true,
  larkCli: true,
  mediaReady: true,
  pdfReady: true,
  platformReady: true,
  ready: true,
  tencentAsr: false,
  tencentAsrEnabled: false,
  whisperCli: true,
  whisperModel: true,
  ytDlp: true,
};

describe('AI model readiness summary', () => {
  it('treats local Whisper as a valid transcription fallback', () => {
    const result = buildAiModelReadinessSummary(SETTINGS, READINESS, true);

    expect(result.transcriptionReady).toBe(true);
    expect(result.modelsReady).toBe(true);
    expect(result.currentTranscriptionLabel).toBe('本地 Whisper');
  });

  it('rejects a summary reference when its provider is disabled', () => {
    const result = buildAiModelReadinessSummary(
      {
        ...SETTINGS,
        providers: [{ ...PROVIDER, enabled: false }],
      },
      READINESS,
      true,
    );

    expect(result.providerReady).toBe(false);
    expect(result.summaryReady).toBe(false);
    expect(result.modelsReady).toBe(false);
    expect(result.currentSummaryLabel).toBe('尚未配置总结模型');
  });

  it('accepts the platform builtin summary model without an API provider', () => {
    const result = buildAiModelReadinessSummary(
      {
        providers: [],
        transcriptionMode: 'tencent_asr',
      },
      READINESS,
      false,
    );

    expect(result.providerReady).toBe(true);
    expect(result.modelsReady).toBe(true);
    expect(result.currentSummaryLabel).toBe('使用妙搭内置 AI');
  });

  it('shows the alternate ready cloud transcription provider', () => {
    const result = buildAiModelReadinessSummary(
      {
        ...SETTINGS,
        transcriptionMode: 'custom_api',
      },
      {
        ...READINESS,
        tencentAsr: true,
        whisperCli: false,
        whisperModel: false,
      },
      true,
    );

    expect(result.transcriptionReady).toBe(true);
    expect(result.currentTranscriptionLabel).toBe('腾讯 ASR');
  });
});
