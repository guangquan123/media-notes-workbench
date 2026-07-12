import { BadRequestException } from '@nestjs/common';
import type {
  CreateNoteJobRequest,
  NoteStyle,
  NoteSourceType,
  SourcePlatform,
  UploadedMediaInput,
} from '@shared/api.interface';
import { DEFAULT_NOTE_TEMPLATES } from './note-template.defaults';

const MAX_MEDIA_SIZE = 1024 * 1024 * 1024;
const MAX_PDF_SIZE = 200 * 1024 * 1024;
const MEDIA_MIME_PREFIX: Record<
  Exclude<NoteSourceType, 'platform' | 'pdf'>,
  string
> = {
  video: 'video/',
  audio: 'audio/',
};

interface PlatformJobInput {
  sourceType: 'platform';
  noteStyle: NoteStyle;
  url: string;
}

interface MediaJobInput {
  sourceType: 'video' | 'audio';
  noteStyle: NoteStyle;
  media: UploadedMediaInput;
}

interface PdfJobInput {
  sourceType: 'pdf';
  noteStyle: NoteStyle;
  media: UploadedMediaInput;
}

type ValidatedNoteJobInput = PlatformJobInput | MediaJobInput | PdfJobInput;

const NOTE_STYLES: readonly NoteStyle[] = ['learning', 'meeting'];

const PLATFORM_URL_PROFILES: Record<
  SourcePlatform,
  {
    readonly urlHosts: readonly string[];
    readonly urlErrorMessage: string;
  }
> = {
  bilibili: {
    urlHosts: ['bilibili.com', 'b23.tv'],
    urlErrorMessage: '请输入有效的 B站视频地址',
  },
  douyin: {
    urlHosts: ['douyin.com', 'iesdouyin.com', 'v.douyin.com'],
    urlErrorMessage: '请输入有效的抖音视频地址',
  },
};

export function validateNoteStyle(value?: string): NoteStyle {
  if (!value) return 'learning';
  if (NOTE_STYLES.includes(value as NoteStyle)) {
    return value as NoteStyle;
  }
  throw new BadRequestException('不支持的笔记风格');
}

export function getNoteStyleRequirement(noteStyle: NoteStyle): string {
  return DEFAULT_NOTE_TEMPLATES[noteStyle].content;
}

export function normalizePlatformSourceUrl(
  raw: string,
  platform: SourcePlatform,
): string {
  try {
    const urlMatch = raw.match(/https?:\/\/[^\s]+/u);
    const profile = PLATFORM_URL_PROFILES[platform];
    if (!urlMatch) {
      throw new Error(profile.urlErrorMessage);
    }
    const url = new URL(urlMatch[0]);
    const hostname = url.hostname.toLowerCase();
    const allowed = profile.urlHosts.some(
      (allowedHost) =>
        hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
    );
    if (!allowed || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error(profile.urlErrorMessage);
    }
    return platform === 'douyin' ? normalizeDouyinUrl(url) : url.toString();
  } catch (error) {
    const profile = PLATFORM_URL_PROFILES[platform];
    if (error instanceof Error && error.message) {
      throw new BadRequestException(error.message);
    }
    throw new BadRequestException(profile.urlErrorMessage);
  }
}

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

export function validatePdfInput(
  input: UploadedMediaInput,
): UploadedMediaInput {
  const extension: string =
    input.fileName?.split('.').pop()?.toLowerCase() || '';
  if (!input.fileName?.trim() || !input.mimeType?.trim()) {
    throw new BadRequestException('文件信息不完整');
  }
  if (
    !Number.isFinite(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > MAX_PDF_SIZE
  ) {
    throw new BadRequestException('PDF 文件不能超过 200 MB');
  }
  if (
    input.mimeType.toLowerCase() !== 'application/pdf' &&
    extension !== 'pdf'
  ) {
    throw new BadRequestException('请选择有效的 PDF 文件');
  }
  validateMediaDownloadUrl(input.downloadUrl);
  return {
    ...input,
    fileName: input.fileName.trim().slice(0, 240),
    mimeType: 'application/pdf',
  };
}

export function validateNoteJobRequest(
  input: CreateNoteJobRequest,
): ValidatedNoteJobInput {
  const sourceType: NoteSourceType = input.sourceType || 'platform';
  const noteStyle: NoteStyle = validateNoteStyle(input.noteStyle);
  if (sourceType === 'platform') {
    if (!input.url?.trim()) {
      throw new BadRequestException('请粘贴需要处理的视频地址');
    }
    return { sourceType, noteStyle, url: input.url };
  }
  if (
    sourceType !== 'video' &&
    sourceType !== 'audio' &&
    sourceType !== 'pdf'
  ) {
    throw new BadRequestException('不支持的内容来源');
  }
  if (!input.media) {
    throw new BadRequestException(
      sourceType === 'video'
        ? '请选择需要处理的视频文件'
        : '请选择需要处理的录音文件',
    );
  }
  if (sourceType === 'pdf') {
    return {
      sourceType,
      noteStyle,
      media: validatePdfInput(input.media),
    };
  }
  return {
    sourceType,
    noteStyle,
    media: validateMediaInput(input.media, sourceType),
  };
}

function normalizeDouyinUrl(url: URL): string {
  if (url.pathname === '/jingxuan') {
    const videoId = url.searchParams.get('modal_id');
    if (!videoId || !/^\d+$/u.test(videoId)) {
      throw new Error('抖音精选链接缺少有效的 modal_id');
    }
    return `https://www.douyin.com/video/${videoId}`;
  }
  return url.toString();
}
