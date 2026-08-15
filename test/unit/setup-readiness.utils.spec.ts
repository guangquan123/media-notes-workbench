import type {
  ConnectorSettingsResponse,
  ExternalModelSettings,
  RuntimeStatus,
  SystemReadiness,
  TaskNotificationSettings,
  TencentAsrSettings,
} from '../../shared/api.interface';
import { buildSetupReadiness } from '../../client/src/pages/SettingsPage/setup-readiness.utils';

const BASE_READINESS: SystemReadiness = {
  connectorReady: true,
  connectorType: 'local',
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

const LOCAL_RUNTIME: RuntimeStatus = {
  ai: 'external',
  auth: 'local',
  database: 'local',
  label: '本地',
  mode: 'local',
  ready: true,
  storage: 'local',
};

const PLATFORM_RUNTIME: RuntimeStatus = {
  ai: 'builtin',
  auth: 'platform',
  database: 'platform',
  label: '妙搭平台',
  mode: 'miaoda',
  ready: true,
  storage: 'platform',
};

const CONNECTORS: ConnectorSettingsResponse = {
  activeConnector: 'local',
  items: [
    {
      capabilities: ['document.write'],
      configured: true,
      enabled: true,
      label: '本地',
      status: 'ready',
      type: 'local',
    },
  ],
};

const ASR_DISABLED: TencentAsrSettings = {
  asrRegion: 'ap-guangzhou',
  bucket: '',
  configured: false,
  enabled: false,
  engineModelType: '16k_zh_en_2.0',
  region: 'ap-shanghai',
  secretId: '',
  secretKeyConfigured: false,
  speakerDiarization: false,
};

const MODEL_READY: ExternalModelSettings = {
  apiKeyConfigured: true,
  baseUrl: 'https://example.test/v1',
  configured: true,
  enabled: true,
  model: 'test-model',
};

const NOTIFICATIONS_DISABLED: TaskNotificationSettings = {
  configured: false,
  items: [],
};

function build(
  overrides: {
    externalModel?: ExternalModelSettings | null;
    readiness?: Partial<SystemReadiness>;
    runtime?: RuntimeStatus | null;
    tencentAsr?: TencentAsrSettings | null;
  } = {},
) {
  return buildSetupReadiness({
    connectors: CONNECTORS,
    externalModel:
      overrides.externalModel === undefined
        ? MODEL_READY
        : overrides.externalModel,
    notifications: NOTIFICATIONS_DISABLED,
    readiness: { ...BASE_READINESS, ...overrides.readiness },
    runtime:
      overrides.runtime === undefined ? LOCAL_RUNTIME : overrides.runtime,
    tencentAsr:
      overrides.tencentAsr === undefined ? ASR_DISABLED : overrides.tencentAsr,
  });
}

describe('setup readiness', () => {
  it('marks core capabilities ready with local connector, ffmpeg, Whisper and external model', () => {
    const result = build();

    expect(result.status).toBe('ready');
    expect(result.availableSourceLabels).toEqual([
      '文档资料',
      '本地音视频',
      '平台视频链接',
    ]);
  });

  it('supports legacy readiness responses that only expose larkCli', () => {
    const result = build({
      readiness: { connectorReady: undefined, larkCli: true },
    });

    expect(result.items.find((item) => item.id === 'connector')?.status).toBe(
      'ready',
    );
  });

  it('supports connector responses without the optional descriptor list', () => {
    const result = buildSetupReadiness({
      connectors: { activeConnector: 'local' } as ConnectorSettingsResponse,
      externalModel: MODEL_READY,
      notifications: NOTIFICATIONS_DISABLED,
      readiness: BASE_READINESS,
      runtime: LOCAL_RUNTIME,
      tencentAsr: ASR_DISABLED,
    });

    expect(result.items.find((item) => item.id === 'connector')).toMatchObject({
      label: '笔记输出位置',
      status: 'ready',
    });
    expect(result.summary).toContain('本地');
  });

  it('accepts Tencent ASR as the Whisper alternative while still requiring ffmpeg', () => {
    const withTencentAsr = build({
      readiness: {
        tencentAsr: true,
        tencentAsrEnabled: true,
        whisperCli: false,
        whisperModel: false,
      },
    });
    const withoutFfmpeg = build({
      readiness: {
        ffmpeg: false,
        mediaReady: false,
        tencentAsr: true,
        tencentAsrEnabled: true,
        whisperCli: false,
        whisperModel: false,
      },
    });

    expect(
      withTencentAsr.items.find((item) => item.id === 'local-media')?.status,
    ).toBe('ready');
    expect(
      withoutFfmpeg.items.find((item) => item.id === 'local-media')?.status,
    ).toBe('action');
  });

  it('limits a missing yt-dlp dependency to platform links', () => {
    const result = build({
      readiness: { platformReady: false, ytDlp: false },
    });

    expect(result.availableSourceLabels).toEqual(['文档资料', '本地音视频']);
    expect(
      result.items.find((item) => item.id === 'platform-media'),
    ).toMatchObject({
      required: false,
      status: 'optional',
    });
  });

  it('requires an external model in local runtime', () => {
    const result = build({
      externalModel: {
        ...MODEL_READY,
        apiKeyConfigured: false,
        configured: false,
        enabled: false,
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.availableSourceLabels).toEqual([]);
    expect(result.items.find((item) => item.id === 'model')).toMatchObject({
      required: true,
      status: 'action',
    });
    expect(result.items.find((item) => item.id === 'documents')).toMatchObject({
      actionSection: 'model',
      status: 'action',
    });
    expect(
      result.items.find((item) => item.id === 'local-media'),
    ).toMatchObject({
      actionSection: 'model',
      status: 'action',
    });
  });

  it('keeps the external model optional when platform runtime has a builtin model', () => {
    const result = build({
      externalModel: {
        ...MODEL_READY,
        apiKeyConfigured: false,
        configured: false,
        enabled: false,
      },
      runtime: PLATFORM_RUNTIME,
    });

    expect(result.status).toBe('ready');
    expect(result.items.find((item) => item.id === 'model')).toMatchObject({
      required: false,
      status: 'optional',
    });
  });

  it('does not claim readiness when runtime mode cannot be verified', () => {
    const result = build({ runtime: null });

    expect(result.status).toBe('blocked');
    expect(
      result.items.find((item) => item.id === 'model')?.description,
    ).toContain('无法确认当前运行模式');
  });
});
