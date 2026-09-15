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
        expect.objectContaining({ id: 'ffmpeg', required: true, status: 'unavailable' }),
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
      aiModelSettings: {
        ...EMPTY_MODELS,
        summaryModel: {
          model: 'summary-model',
          providerId: 'provider-1',
          providerName: 'Provider',
        },
      },
      readiness: BASE_READINESS,
      selectedCapabilities: ['documents'],
      storageReady: true,
    });

    expect(actions).toEqual([]);
  });

  it('requires a connector only when external sync is selected', () => {
    const actions = buildSetupRequiredActions({
      aiModelSettings: {
        ...EMPTY_MODELS,
        summaryModel: {
          model: 'summary-model',
          providerId: 'provider-1',
          providerName: 'Provider',
        },
      },
      readiness: BASE_READINESS,
      selectedCapabilities: ['documents', 'external_sync'],
      storageReady: true,
    });

    expect(actions).toEqual([
      { action: 'configure_connector', label: '配置同步位置' },
    ]);
  });
});
