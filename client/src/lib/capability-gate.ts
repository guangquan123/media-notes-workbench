import type {
  AiModelSettings,
  RecordingStorageSettings,
  SetupCapability,
  SystemReadiness,
} from '@shared/api.interface';

export interface CapabilityGateIssue {
  actionSection: 'ai' | 'connectors' | 'recordings' | 'setup';
  actionTab?: 'models';
  label: string;
  reason: string;
}

export interface CapabilityGateResult {
  issues: CapabilityGateIssue[];
  ready: boolean;
}

function hasTranscription(readiness: SystemReadiness): boolean {
  return Boolean(
    readiness.tencentAsr ||
    readiness.customApiTranscription ||
    (readiness.whisperCli && readiness.whisperModel),
  );
}

export function getCapabilityGateResult(
  capability: SetupCapability,
  readiness: SystemReadiness,
  aiSettings: AiModelSettings | null,
  localRuntime: boolean,
  recordingStorage: RecordingStorageSettings | null = null,
): CapabilityGateResult {
  const issues: CapabilityGateIssue[] = [];
  if (localRuntime && !aiSettings?.summaryModel) {
    issues.push({
      actionSection: 'ai',
      actionTab: 'models',
      label: '总结模型',
      reason: '生成笔记需要一个可用的总结模型。',
    });
  }

  if (capability === 'external_sync' && !readiness.connectorReady) {
    issues.push({
      actionSection: 'connectors',
      label: '飞书或钉钉连接器',
      reason: '外部同步需要先完成连接器授权和验证。',
    });
  }

  const mediaCapability: boolean = [
    'local_audio',
    'local_video',
    'recording',
    'platform_video',
  ].includes(capability);
  if (mediaCapability && !readiness.ffmpeg) {
    issues.push({
      actionSection: 'setup',
      label: '音视频处理组件',
      reason: '音频和视频需要 ffmpeg 提取音轨并处理媒体。',
    });
  }
  const videoCapability: boolean =
    capability === 'local_video' || capability === 'platform_video';
  if (videoCapability && !hasTranscription(readiness)) {
    issues.push({
      actionSection: 'ai',
      actionTab: 'models',
      label: '语音转文字',
      reason:
        '视频笔记需要一种可用的转录方式；可以选择腾讯云 ASR、兼容 API，或额外配置本地 Whisper。',
    });
  } else if (mediaCapability && !hasTranscription(readiness)) {
    issues.push({
      actionSection: 'ai',
      actionTab: 'models',
      label: '语音转文字',
      reason: '音视频笔记需要先配置一种可用的转录方式。',
    });
  }
  if (
    capability === 'recording' &&
    (!recordingStorage?.archivePath ||
      !recordingStorage.archivePath.trim() ||
      recordingStorage.updatedAt === '1970-01-01T00:00:00.000Z')
  ) {
    issues.push({
      actionSection: 'recordings',
      label: '录音本地保存位置',
      reason: '开始录音前必须先配置一个可写的本地保存目录。',
    });
  }
  if (
    mediaCapability &&
    !readiness.documentReady &&
    !readiness.connectorReady
  ) {
    issues.push({
      actionSection: 'connectors',
      label: '笔记输出位置',
      reason: '当前运行模式需要先配置一个可用的输出位置。',
    });
  }
  if (capability === 'platform_video' && !readiness.ytDlp) {
    issues.push({
      actionSection: 'setup',
      label: '平台视频下载组件',
      reason: '处理平台视频链接需要 yt-dlp。',
    });
  }

  return { issues, ready: issues.length === 0 };
}
