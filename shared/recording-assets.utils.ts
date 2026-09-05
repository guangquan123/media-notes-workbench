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

function archiveExtension(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType.toLowerCase()] || 'bin';
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
