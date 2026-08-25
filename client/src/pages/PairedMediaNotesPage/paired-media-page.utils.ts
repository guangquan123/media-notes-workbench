import {
  toStoredSourceObject,
  type UploadFileData,
} from '@/components/business-ui/api/files/service';
import type {
  ConnectorType,
  UploadedMediaInput,
} from '@shared/api.interface';

export const MAX_PAIRED_MEDIA_SIZE = 10 * 1024 * 1024 * 1024;
export const VIDEO_ACCEPT: Record<string, string[]> = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-matroska': ['.mkv'],
  'video/webm': ['.webm'],
};
export const AUDIO_ACCEPT: Record<string, string[]> = {
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/aac': ['.aac'],
  'audio/flac': ['.flac'],
  'audio/ogg': ['.ogg'],
};
export function getConnectorLabel(connectorType?: ConnectorType): string {
  return connectorType === 'dingtalk' ? '钉钉' : '飞书';
}

export function getPairedProcessStages(connectorLabel: string) {
  return [
    ['uploading', '安全上传'],
    ['preparing', '提取音轨'],
    ['aligning', '时间对齐'],
    ['extracting-frames', '处理画面'],
    ['transcribing', '双路转写'],
    ['summarizing', '交叉验证'],
    ['publishing', `写入${connectorLabel}`],
  ] as const;
}

export function toUploadedMediaInput(
  file: File,
  uploads: UploadFileData[],
  kind: 'audio' | 'video',
): UploadedMediaInput {
  return {
    downloadUrl: uploads[0].url,
    fileName: file.name,
    fileSize: file.size,
    mimeType: getMimeType(file, kind),
    parts:
      uploads.length > 1
        ? uploads.map((part: UploadFileData) => ({
            downloadUrl: part.url,
            fileSize: part.fileSize,
            storage: toStoredSourceObject(part),
          }))
        : undefined,
    storage:
      uploads.length === 1 ? toStoredSourceObject(uploads[0]) : undefined,
  };
}

export function getPairedLogicalStage(stage?: string): string | undefined {
  if (
    ['extracting-frames', 'uploading-frames', 'analyzing-frames'].includes(
      stage || '',
    )
  ) {
    return 'extracting-frames';
  }
  return stage;
}

function getMimeType(file: File, kind: 'audio' | 'video'): string {
  if (file.type) return file.type;
  const extension: string = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    aac: 'audio/aac',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mkv: 'video/x-matroska',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    webm: 'video/webm',
  };
  return mimeTypes[extension] || `${kind}/unknown`;
}
