import type {
  AiModelSettings,
  SetupCapability,
  SetupEnvironmentCheck,
  SetupRequiredAction,
  SystemReadiness,
} from '@shared/api.interface';

export interface SetupRequirementInput {
  aiModelSettings: AiModelSettings;
  readiness: SystemReadiness;
  selectedCapabilities: SetupCapability[];
  storageReady: boolean;
}

const MEDIA_CAPABILITIES: readonly SetupCapability[] = [
  'local_audio',
  'local_video',
  'recording',
  'platform_video',
];

function needsMediaProcessing(capabilities: SetupCapability[]): boolean {
  return capabilities.some((capability: SetupCapability): boolean =>
    MEDIA_CAPABILITIES.includes(capability),
  );
}

export function getRequiredEnvironmentChecks(
  input: Pick<
    SetupRequirementInput,
    'readiness' | 'selectedCapabilities' | 'storageReady'
  >,
): SetupEnvironmentCheck[] {
  const requiresMedia: boolean = needsMediaProcessing(
    input.selectedCapabilities,
  );
  const requiresPlatformVideo: boolean =
    input.selectedCapabilities.includes('platform_video');
  return [
    {
      detail: input.storageReady
        ? '本机数据目录可读写。'
        : '无法写入本机数据目录，请检查磁盘空间和文件权限。',
      id: 'local_storage',
      label: '本机数据保存',
      required: true,
      status: input.storageReady ? 'ready' : 'unavailable',
    },
    {
      detail: requiresMedia
        ? input.readiness.ffmpeg
          ? '已检测到 ffmpeg。'
          : '处理音频或视频需要 ffmpeg。'
        : '当前选择的用途不需要音视频处理。',
      id: 'ffmpeg',
      label: '音视频处理组件',
      required: requiresMedia,
      status: !requiresMedia
        ? 'not_required'
        : input.readiness.ffmpeg
          ? 'ready'
          : 'unavailable',
    },
    {
      detail: requiresPlatformVideo
        ? input.readiness.ytDlp
          ? '已检测到平台视频下载组件。'
          : '处理平台视频链接需要 yt-dlp。'
        : '当前选择的用途不需要平台视频下载。',
      id: 'yt_dlp',
      label: '平台视频下载组件',
      required: requiresPlatformVideo,
      status: !requiresPlatformVideo
        ? 'not_required'
        : input.readiness.ytDlp
          ? 'ready'
          : 'unavailable',
    },
  ];
}

export function buildSetupRequiredActions(
  input: SetupRequirementInput,
): SetupRequiredAction[] {
  const actions: SetupRequiredAction[] = [];
  const environmentChecks: SetupEnvironmentCheck[] =
    getRequiredEnvironmentChecks(input);
  const hasUnavailableEnvironment: boolean = environmentChecks.some(
    (check: SetupEnvironmentCheck): boolean =>
      check.required && check.status === 'unavailable',
  );
  const requiresMedia: boolean = needsMediaProcessing(
    input.selectedCapabilities,
  );
  const requiresConnector: boolean =
    input.selectedCapabilities.includes('external_sync');

  if (hasUnavailableEnvironment) {
    actions.push({ action: 'repair_storage', label: '修复本机运行环境' });
  }
  if (!input.aiModelSettings.summaryModel) {
    actions.push({ action: 'configure_summary', label: '配置总结模型' });
  }
  if (
    requiresMedia &&
    (!input.aiModelSettings.transcriptionModel ||
      input.aiModelSettings.transcriptionMode !== 'custom_api') &&
    !input.readiness.tencentAsr &&
    !(input.readiness.whisperCli && input.readiness.whisperModel)
  ) {
    actions.push({
      action: 'configure_transcription',
      capability: 'local_audio',
      label: '配置语音转文字',
    });
  }
  if (requiresConnector && !input.readiness.connectorReady) {
    actions.push({ action: 'configure_connector', label: '配置同步位置' });
  }
  return actions;
}

export function isSetupCapability(value: unknown): value is SetupCapability {
  return (
    value === 'documents' ||
    value === 'local_audio' ||
    value === 'local_video' ||
    value === 'recording' ||
    value === 'platform_video' ||
    value === 'external_sync'
  );
}
