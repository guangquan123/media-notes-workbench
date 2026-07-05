import { BadRequestException } from '@nestjs/common';
import type {
  CreateNoteJobRequest,
  NoteSourceType,
  UploadedMediaInput,
} from '@shared/api.interface';

const MAX_MEDIA_SIZE = 1024 * 1024 * 1024;
const MEDIA_MIME_PREFIX: Record<Exclude<NoteSourceType, 'platform'>, string> = {
  video: 'video/',
  audio: 'audio/',
};

interface PlatformJobInput {
  sourceType: 'platform';
  url: string;
}

interface MediaJobInput {
  sourceType: 'video' | 'audio';
  media: UploadedMediaInput;
}

type ValidatedNoteJobInput = PlatformJobInput | MediaJobInput;

function isPrivateHostname(hostname: string): boolean {
  const normalized: string = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    /^127[.]/u.test(normalized) ||
    /^10[.]/u.test(normalized) ||
    /^192[.]168[.]/u.test(normalized) ||
    /^169[.]254[.]/u.test(normalized) ||
    /^172[.](1[6-9]|2\d|3[01])[.]/u.test(normalized)
  );
}

export function validateMediaDownloadUrl(rawUrl: string): URL {
  try {
    const url: URL = new URL(rawUrl);
    if (url.protocol !== 'https:' || isPrivateHostname(url.hostname)) {
      throw new Error('unsafe');
    }
    return url;
  } catch {
    throw new BadRequestException('文件下载地址不安全');
  }
}

export function validateMediaInput(
  input: UploadedMediaInput,
  sourceType: 'video' | 'audio',
): UploadedMediaInput {
  if (!input.fileName?.trim() || !input.mimeType?.trim()) {
    throw new BadRequestException('文件信息不完整');
  }
  if (
    !Number.isFinite(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > MAX_MEDIA_SIZE
  ) {
    throw new BadRequestException('文件不能超过 1 GB');
  }
  if (!input.mimeType.startsWith(MEDIA_MIME_PREFIX[sourceType])) {
    throw new BadRequestException(
      sourceType === 'video' ? '请选择有效的视频文件' : '请选择有效的录音文件',
    );
  }
  validateMediaDownloadUrl(input.downloadUrl);
  return {
    ...input,
    fileName: input.fileName.trim().slice(0, 240),
    mimeType: input.mimeType.trim().toLowerCase(),
  };
}

export function validateNoteJobRequest(
  input: CreateNoteJobRequest,
): ValidatedNoteJobInput {
  const sourceType: NoteSourceType = input.sourceType || 'platform';
  if (sourceType === 'platform') {
    if (!input.url?.trim()) {
      throw new BadRequestException('请粘贴需要处理的视频地址');
    }
    return { sourceType, url: input.url };
  }
  if (sourceType !== 'video' && sourceType !== 'audio') {
    throw new BadRequestException('不支持的内容来源');
  }
  if (!input.media) {
    throw new BadRequestException(
      sourceType === 'video'
        ? '请选择需要处理的视频文件'
        : '请选择需要处理的录音文件',
    );
  }
  return {
    sourceType,
    media: validateMediaInput(input.media, sourceType),
  };
}
