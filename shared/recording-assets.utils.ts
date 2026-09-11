import type {
  RecordingAsset,
  RecordingAssetProcessingStatus,
  RecordingAssetStorageStatus,
} from './api.interface';

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

export function normalizeAudioMimeType(mimeType: string): string {
  const normalized = mimeType.split(';', 1)[0]?.trim().toLowerCase() || '';
  return normalized === 'audio/x-m4a' ? 'audio/mp4' : normalized;
}

export function getRecordingFormatLabel(mimeType: string): string {
  const normalized: string = normalizeAudioMimeType(mimeType);
  const codec: string =
    mimeType.match(/codecs=([^;]+)/iu)?.[1]?.trim().toLowerCase() || '';
  if (normalized === 'audio/webm') {
    return codec.includes('opus') ? 'WebM（Opus 编码）' : 'WebM 音频';
  }
  if (normalized === 'audio/ogg') {
    return codec.includes('opus') ? 'Ogg（Opus 编码）' : 'Ogg 音频';
  }
  if (normalized === 'audio/mp4') {
    return codec.includes('mp4a') ? 'M4A（AAC 编码）' : 'M4A 音频';
  }
  if (normalized === 'audio/mpeg') return 'MP3 音频';
  if (normalized === 'audio/wav') return 'WAV 音频';
  if (normalized === 'audio/aac') return 'AAC 音频';
  if (normalized === 'audio/flac') return 'FLAC 音频';
  return '音频文件';
}

export function buildRecordingMeetingTitle(
  capturedAt: string,
  topic: string,
): string {
  const date: Date = new Date(capturedAt);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(Number.isNaN(date.getTime()) ? new Date() : date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const dateLabel: string = `${values.year}-${values.month}-${values.day}`;
  const normalizedTopic: string = topic
    .replace(/^\s*#+\s*/u, '')
    .replace(/^\s*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s*[·•-]?\s*/u, '')
    .trim()
    .slice(0, 120);
  return `${dateLabel} · ${normalizedTopic || '会议纪要'}`;
}

export function archiveExtension(mimeType: string): string {
  return MIME_EXTENSIONS[normalizeAudioMimeType(mimeType)] || 'bin';
}

function safeTitle(title: string): string {
  const normalized = title.trim() || '未命名录音';
  return (
    normalized.replace(/[<>:"/\\|?*\u0000-\u001f\uFF1A]/gu, '-').trim() ||
    '未命名录音'
  );
}

export function buildRecordingArchiveFileName(
  title: string,
  capturedAt: string,
  mimeType: string,
  assetId: string,
): string {
  const date = new Date(capturedAt);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const stamp = `${values.year}-${values.month}-${values.day}_${values.hour}-${values.minute}`;
  const safeId =
    assetId.replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 48) || 'asset';
  return `${stamp}_${safeTitle(title)}_${safeId}.${archiveExtension(mimeType)}`;
}

function priority(item: RecordingAsset): number {
  if (item.processingStatus === 'unprocessed') return 0;
  if (
    item.storageStatus === 'pending_archive' ||
    item.storageStatus === 'archive_failed'
  )
    return 1;
  if (item.processingStatus === 'failed') return 2;
  if (item.processingStatus === 'processing') return 3;
  return 4;
}

export function sortRecordingAssets<T extends RecordingAsset>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const priorityDifference = priority(left) - priority(right);
    if (priorityDifference !== 0) return priorityDifference;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function filterRecordingAssets<T extends RecordingAsset>(
  items: T[],
  filters: {
    keyword?: string;
    processingStatus?: RecordingAssetProcessingStatus;
    storageStatus?: RecordingAssetStorageStatus;
  },
): T[] {
  const keyword = filters.keyword?.trim().toLowerCase() || '';
  return items.filter((item) => {
    const matchesKeyword =
      !keyword ||
      `${item.title} ${item.fileName}`.toLowerCase().includes(keyword);
    const matchesProcessing =
      !filters.processingStatus ||
      item.processingStatus === filters.processingStatus;
    const matchesStorage =
      !filters.storageStatus || item.storageStatus === filters.storageStatus;
    return matchesKeyword && matchesProcessing && matchesStorage;
  });
}
