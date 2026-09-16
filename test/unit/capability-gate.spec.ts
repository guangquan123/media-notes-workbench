import type {
  AiModelSettings,
  SystemReadiness,
} from '../../shared/api.interface';
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
  providers: [
    {
      apiKeyConfigured: true,
      baseUrl: 'https://api.example.com/v1',
      configured: true,
      enabled: true,
      id: 'provider-1',
      models: [
        {
          capabilities: ['llm'],
          id: 'summary-model',
        },
      ],
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

  it('does not require transcription or media tools for documents', () => {
    const result = getCapabilityGateResult(
      'documents',
      {
        ...BASE_READINESS,
        ffmpeg: false,
        tencentAsr: false,
        tencentAsrEnabled: false,
      },
      AI_SETTINGS,
      true,
    );

    expect(result).toEqual({ issues: [], ready: true });
  });

  it('does not require a summary model for connector-only setup', () => {
    const result = getCapabilityGateResult(
      'external_sync',
      { ...BASE_READINESS, connectorReady: false },
      { providers: [], transcriptionMode: 'tencent_asr' },
      true,
    );

    expect(result.issues.map((issue) => issue.label)).toEqual([
      '飞书或钉钉连接器',
    ]);
  });

  it('requires an output location for documents outside local runtime', () => {
    const result = getCapabilityGateResult(
      'documents',
      {
        ...BASE_READINESS,
        connectorReady: false,
        documentReady: false,
        pdfReady: false,
      },
      AI_SETTINGS,
      false,
    );

    expect(result.issues.map((issue) => issue.label)).toEqual(['笔记输出位置']);
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

  it('allows video workflows to use a configured cloud transcription service', () => {
    const result = getCapabilityGateResult(
      'local_video',
      {
        ...BASE_READINESS,
        customApiTranscription: true,
        tencentAsr: false,
        tencentAsrEnabled: false,
      },
      AI_SETTINGS,
      true,
    );

    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('requires recording storage only for the recording entry', () => {
    const missingStorage = {
      archivePath: '',
      autoArchive: true,
      checkDiskSpace: true,
      updatedAt: '1970-01-01T00:00:00.000Z',
    };

    expect(
      getCapabilityGateResult(
        'recording',
        BASE_READINESS,
        AI_SETTINGS,
        true,
        missingStorage,
      ).issues.map((issue) => issue.label),
    ).toContain('录音本地保存位置');
    expect(
      getCapabilityGateResult(
        'local_audio',
        BASE_READINESS,
        AI_SETTINGS,
        true,
        missingStorage,
      ).issues.map((issue) => issue.label),
    ).not.toContain('录音本地保存位置');
  });

  it('requires yt-dlp only for the platform video entry', () => {
    const withoutDownloader: SystemReadiness = {
      ...BASE_READINESS,
      ytDlp: false,
    };

    expect(
      getCapabilityGateResult(
        'platform_video',
        withoutDownloader,
        AI_SETTINGS,
        true,
      ).issues.map((issue) => issue.label),
    ).toContain('平台视频下载组件');
    expect(
      getCapabilityGateResult(
        'local_video',
        withoutDownloader,
        AI_SETTINGS,
        true,
      ).issues.map((issue) => issue.label),
    ).not.toContain('平台视频下载组件');
  });

  it('rejects a summary model whose provider is disabled', () => {
    const settings: AiModelSettings = {
      ...AI_SETTINGS,
      providers: AI_SETTINGS.providers.map((provider) => ({
        ...provider,
        enabled: false,
      })),
    };

    expect(
      getCapabilityGateResult(
        'documents',
        BASE_READINESS,
        settings,
        true,
      ).issues.map((issue) => issue.label),
    ).toContain('总结模型');
  });
});
