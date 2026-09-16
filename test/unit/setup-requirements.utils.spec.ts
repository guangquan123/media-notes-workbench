import type {
  AiModelSettings,
  SystemReadiness,
} from '../../shared/api.interface';
import {
  buildSetupRequiredActions,
  getRequiredEnvironmentChecks,
} from '../../server/modules/setup/setup-requirements.utils';

const EMPTY_MODELS: AiModelSettings = {
  providers: [],
  transcriptionMode: 'tencent_asr',
};

const CONFIGURED_SUMMARY_MODEL: AiModelSettings = {
  providers: [
    {
      apiKeyConfigured: true,
      baseUrl: 'https://models.example.com/v1',
      configured: true,
      enabled: true,
      id: 'provider-1',
      models: [],
      name: 'Provider',
    },
  ],
  summaryModel: {
    model: 'summary-model',
    providerId: 'provider-1',
    providerName: 'Provider',
  },
  transcriptionMode: 'tencent_asr',
};

const BASE_READINESS: SystemReadiness = {
  connectorReady: false,
  documentReady: false,
  ffmpeg: false,
  larkCli: false,
  mediaReady: false,
  pdfReady: false,
  platformReady: false,
  ready: false,
  tencentAsr: false,
  tencentAsrEnabled: false,
  whisperCli: false,
  whisperModel: false,
  ytDlp: false,
};

describe('setup requirements', () => {
  it('keeps document-only onboarding independent from transcription and connectors', () => {
    const actions = buildSetupRequiredActions({
      aiModelSettings: EMPTY_MODELS,
      readiness: BASE_READINESS,
      selectedCapabilities: ['documents'],
      storageReady: true,
    });
    const checks = getRequiredEnvironmentChecks({
      readiness: BASE_READINESS,
      selectedCapabilities: ['documents'],
      storageReady: true,
    });

    expect(actions).toEqual([
      { action: 'configure_summary', label: '配置总结模型' },
    ]);
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ffmpeg', status: 'not_required' }),
        expect.objectContaining({ id: 'yt_dlp', status: 'not_required' }),
      ]),
    );
  });

  it('requires media dependencies only for media scenarios', () => {
    const checks = getRequiredEnvironmentChecks({
      readiness: BASE_READINESS,
      selectedCapabilities: ['local_audio'],
      storageReady: true,
    });
    const actions = buildSetupRequiredActions({
      aiModelSettings: EMPTY_MODELS,
      readiness: BASE_READINESS,
      selectedCapabilities: ['local_audio'],
      storageReady: true,
    });

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ffmpeg',
          required: true,
          status: 'unavailable',
        }),
      ]),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'configure_summary' }),
        expect.objectContaining({ action: 'configure_transcription' }),
        expect.objectContaining({ action: 'repair_storage' }),
      ]),
    );
  });

  it('does not require platform downloading for browser recording alone', () => {
    const checks = getRequiredEnvironmentChecks({
      readiness: BASE_READINESS,
      selectedCapabilities: ['recording'],
      storageReady: true,
    });

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ffmpeg',
          required: true,
          status: 'unavailable',
        }),
        expect.objectContaining({
          id: 'yt_dlp',
          required: false,
          status: 'not_required',
        }),
      ]),
    );
  });

  it('does not require a connector for local note workflows', () => {
    const actions = buildSetupRequiredActions({
      aiModelSettings: CONFIGURED_SUMMARY_MODEL,
      readiness: BASE_READINESS,
      selectedCapabilities: ['documents'],
      storageReady: true,
    });

    expect(actions).toEqual([]);
  });

  it('requires a connector only when external sync is selected', () => {
    const actions = buildSetupRequiredActions({
      aiModelSettings: CONFIGURED_SUMMARY_MODEL,
      readiness: BASE_READINESS,
      selectedCapabilities: ['documents', 'external_sync'],
      storageReady: true,
    });

    expect(actions).toEqual([
      { action: 'configure_connector', label: '配置同步位置' },
    ]);
  });

  it('does not require local Whisper when video has cloud transcription', () => {
    const actions = buildSetupRequiredActions({
      aiModelSettings: CONFIGURED_SUMMARY_MODEL,
      readiness: {
        ...BASE_READINESS,
        ffmpeg: true,
        tencentAsr: true,
        tencentAsrEnabled: true,
      },
      selectedCapabilities: ['local_video'],
      storageReady: true,
    });

    expect(actions).toEqual([]);
  });

  it('accepts the local Whisper fallback as transcription readiness', () => {
    const actions = buildSetupRequiredActions({
      aiModelSettings: CONFIGURED_SUMMARY_MODEL,
      readiness: {
        ...BASE_READINESS,
        ffmpeg: true,
        whisperCli: true,
        whisperModel: true,
      },
      selectedCapabilities: ['local_audio'],
      storageReady: true,
    });

    expect(actions).not.toContainEqual(
      expect.objectContaining({ action: 'configure_transcription' }),
    );
  });

  it('does not accept a model reference backed by a disabled provider', () => {
    const actions = buildSetupRequiredActions({
      aiModelSettings: {
        providers: [
          {
            apiKeyConfigured: true,
            baseUrl: 'https://models.example.com/v1',
            configured: true,
            enabled: false,
            id: 'provider-1',
            models: [],
            name: 'Disabled provider',
          },
        ],
        summaryModel: {
          model: 'summary-model',
          providerId: 'provider-1',
          providerName: 'Disabled provider',
        },
        transcriptionMode: 'tencent_asr',
      },
      readiness: BASE_READINESS,
      selectedCapabilities: ['documents'],
      storageReady: true,
    });

    expect(actions).toContainEqual({
      action: 'configure_summary',
      label: '配置总结模型',
    });
  });

  it('requires transcription when a stale custom model reference is unusable', () => {
    const actions = buildSetupRequiredActions({
      aiModelSettings: {
        providers: [],
        summaryModel: undefined,
        transcriptionMode: 'custom_api',
        transcriptionModel: {
          model: 'whisper-1',
          providerId: 'missing-provider',
          providerName: 'Missing provider',
        },
      },
      readiness: BASE_READINESS,
      selectedCapabilities: ['local_audio'],
      storageReady: true,
    });

    expect(actions).toContainEqual({
      action: 'configure_transcription',
      capability: 'local_audio',
      label: '配置语音转文字',
    });
  });
});
