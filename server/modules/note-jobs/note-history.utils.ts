import type { NoteSourceType, SourcePlatform } from '@shared/api.interface';

function calculateDurationMs(startedAt: Date, completedAt: Date): number {
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '处理中';
  const totalSeconds: number = Math.max(0, Math.round(durationMs / 1000));
  const minutes: number = Math.floor(totalSeconds / 60);
  const seconds: number = totalSeconds % 60;
  if (minutes === 0) return `${seconds} 秒`;
  if (seconds === 0) return `${minutes} 分钟`;
  return `${minutes} 分 ${seconds} 秒`;
}

function getConversionTypeLabel(
  sourceType: NoteSourceType,
  sourcePlatform?: SourcePlatform,
): string {
  if (sourceType === 'video') return '本地视频';
  if (sourceType === 'audio') return '录音';
  if (sourceType === 'pdf') return 'PDF 资料';
  return sourcePlatform === 'douyin' ? '抖音视频' : 'B站视频';
}

export { calculateDurationMs, formatDuration, getConversionTypeLabel };
