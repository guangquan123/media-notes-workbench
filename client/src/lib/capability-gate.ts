import type {
  AiModelSettings,
  RecordingStorageSettings,
  SetupCapability,
  SystemReadiness,
} from '@shared/api.interface';
import {
  hasAvailableTranscription,
  hasConfiguredModel,
} from '@shared/model-settings.utils';

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

const NOTE_CAPABILITIES: readonly SetupCapability[] = [
  'documents',
  'local_audio',
  'local_video',
  'recording',
  'platform_video',
];

const MEDIA_CAPABILITIES: readonly SetupCapability[] = [
  'local_audio',
  'local_video',
  'recording',
  'platform_video',
];

export function getCapabilityGateResult(
  capability: SetupCapability,
  readiness: SystemReadiness,
  aiSettings: AiModelSettings | null,
  localRuntime: boolean,
  recordingStorage: RecordingStorageSettings | null = null,
): CapabilityGateResult {
  const issues: CapabilityGateIssue[] = [];
  const noteCapability: boolean = NOTE_CAPABILITIES.includes(capability);
  const mediaCapability: boolean = MEDIA_CAPABILITIES.includes(capability);

  if (
    noteCapability &&
    localRuntime &&
    !hasConfiguredModel(aiSettings, 'llm')
  ) {
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

  if (mediaCapability && !readiness.ffmpeg) {
    issues.push({
      actionSection: 'setup',
      label: '音视频处理组件',
      reason: '音频和视频需要 ffmpeg 提取音轨并处理媒体。',
    });
  }
  const videoCapability: boolean =
    capability === 'local_video' || capability === 'platform_video';
  if (videoCapability && !hasAvailableTranscription(readiness)) {
    issues.push({
      actionSection: 'ai',
      actionTab: 'models',
      label: '语音转文字',
      reason:
        '视频笔记需要一种可用的转录方式；可以选择腾讯云 ASR、兼容 API，或额外配置本地 Whisper。',
    });
  } else if (mediaCapability && !hasAvailableTranscription(readiness)) {
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
  if (noteCapability && !readiness.documentReady) {
    issues.push({
      actionSection: 'connectors',
      label: '笔记输出位置',
      reason: '当前运行模式需要先配置一个可用的飞书或钉钉输出位置。',
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
