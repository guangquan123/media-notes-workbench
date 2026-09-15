import type { AiModelSettings, SystemReadiness } from '../../shared/api.interface';
import { getCapabilityGateResult } from '../../client/src/lib/capability-gate';

const BASE_READINESS: SystemReadiness = {
  connectorReady: false,
  documentReady: true,
  ffmpeg: true,
  larkCli: false,
  mediaReady: true,
  pdfReady: true,
  platformReady: true,
  ready: true,
  tencentAsr: true,
  tencentAsrEnabled: true,
  whisperCli: false,
  whisperModel: false,
  ytDlp: true,
};

const AI_SETTINGS: AiModelSettings = {
  providers: [],
  summaryModel: {
    model: 'summary-model',
    providerId: 'provider-1',
    providerName: 'Provider',
  },
  transcriptionMode: 'tencent_asr',
};

describe('capability gate', () => {
  it('allows local Markdown documents without an external connector', () => {
    expect(
      getCapabilityGateResult('documents', BASE_READINESS, AI_SETTINGS, true),
    ).toEqual({ issues: [], ready: true });
  });

  it('reports the missing model before a document can be generated', () => {
    const result = getCapabilityGateResult(
      'documents',
      BASE_READINESS,
      { providers: [], transcriptionMode: 'tencent_asr' },
      true,
    );
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionSection: 'ai',
          label: '总结模型',
        }),
      ]),
    );
  });

  it('reports media dependencies without requiring a connector locally', () => {
    const result = getCapabilityGateResult(
      'local_video',
      {
        ...BASE_READINESS,
        ffmpeg: false,
        tencentAsr: false,
        tencentAsrEnabled: false,
        mediaReady: false,
        ready: false,
      },
      AI_SETTINGS,
      true,
    );
    expect(result.issues.map((issue) => issue.label)).toEqual([
      '音视频处理组件',
      '语音转文字',
    ]);
  });

  it('requires the connector only for an explicit external sync capability', () => {
    const result = getCapabilityGateResult(
      'external_sync',
      { ...BASE_READINESS, connectorReady: false },
      AI_SETTINGS,
      true,
    );
    expect(result.issues).toEqual([
      expect.objectContaining({
        actionSection: 'connectors',
        label: '飞书或钉钉连接器',
      }),
    ]);
  });
});
