import { BadRequestException } from '@nestjs/common';
import { isLocalRuntime } from '../runtime/runtime.config';
import type {
  CreateNoteJobRequest,
  JobStage,
  NoteJob,
  NoteStyle,
  NoteSourceType,
  NoteVisualOptions,
  PairedMediaInput,
  SourcePlatform,
  TranscriptionLanguageMode,
  TranscriptionOptions,
  UploadedMediaInput,
} from '@shared/api.interface';
import { normalizeVisualOptions } from './frame-selection.utils';
import { DEFAULT_NOTE_TEMPLATES } from './note-template.defaults';
import {
  getDocumentMimeType,
  isSupportedDocumentFile,
} from './document-note.utils';
import { supportsVisualProcessing } from '@shared/note-visual-source.utils';

export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_MEDIA_DOWNLOAD_CONCURRENCY = 4;
const MAX_MEDIA_PART_SIZE_BYTES = 32 * 1024 * 1024;
const MAX_MEDIA_PART_COUNT = Math.ceil(
  MAX_MEDIA_SIZE_BYTES / MAX_MEDIA_PART_SIZE_BYTES,
);
const MAX_DOCUMENT_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_DOCUMENT_COUNT = 10;
const MEDIA_MIME_PREFIX: Record<
  Exclude<NoteSourceType, 'platform' | 'pdf' | 'document' | 'paired'>,
  string
> = {
  video: 'video/',
  audio: 'audio/',
};

export function getMediaDownloadConcurrency(partCount: number): number {
  if (!Number.isInteger(partCount) || partCount < 1) {
    throw new Error('媒体分片数必须是正整数');
  }
  return Math.min(MAX_MEDIA_DOWNLOAD_CONCURRENCY, partCount);
}

export function isInterruptedProcessingStage(stage: JobStage): boolean {
  return ![
    'completed',
    'cancelled',
    'failed',
    'awaiting-frame-review',
  ].includes(stage);
}

export function buildCancelledNoteJob(
  job: NoteJob,
  updatedAt: string = new Date().toISOString(),
): NoteJob {
  if (['completed', 'cancelled', 'failed'].includes(job.stage)) return job;
  return {
    ...job,
    error: '用户手动取消',
    message: '任务已手动停止',
    stage: 'cancelled',
    updatedAt,
  };
}

interface PlatformJobInput {
  sourceType: 'platform';
  noteStyle: NoteStyle;
  url: string;
  visualOptions: NoteVisualOptions;
}

interface MediaJobInput {
  sourceType: 'video' | 'audio';
  noteStyle: NoteStyle;
  mediaItems: UploadedMediaInput[];
  transcriptionOptions: TranscriptionOptions;
  visualOptions: NoteVisualOptions;
}

interface PairedJobInput {
  noteStyle: NoteStyle;
  pairedMedia: PairedMediaInput;
  sourceType: 'paired';
  visualOptions: NoteVisualOptions;
}

interface DocumentJobInput {
  sourceType: 'document' | 'pdf';
  noteStyle: NoteStyle;
  mediaItems: UploadedMediaInput[];
  visualOptions: NoteVisualOptions;
}

type ValidatedNoteJobInput =
  | PlatformJobInput
  | MediaJobInput
  | PairedJobInput
  | DocumentJobInput;

const NOTE_STYLES: readonly NoteStyle[] = ['learning', 'meeting'];
const TRANSCRIPTION_LANGUAGE_MODES: readonly TranscriptionLanguageMode[] = [
  'mandarin',
  'sichuan',
  'cantonese',
  'mixed',
  'auto',
];

export function normalizeTranscriptionOptions(
  input?: TranscriptionOptions,
): TranscriptionOptions {
  const languageMode: TranscriptionLanguageMode =
    input?.languageMode && TRANSCRIPTION_LANGUAGE_MODES.includes(input.languageMode)
      ? input.languageMode
      : 'auto';
  const hotwords = Array.from(
    new Set(
      (input?.hotwords || [])
        .map((word: string) => String(word).trim())
        .filter(Boolean),
    ),
  ).slice(0, 128);
  return { languageMode, ...(hotwords.length ? { hotwords } : {}) };
}

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

export function getDouyinAudioFallbackArgs(): string[] {
  return ['-filter:a', 'pan=stereo|c0=c0|c1=c1', '-ar', '16000'];
}

export function isAudioRematrixError(message: string): boolean {
  return (
    message.includes('Rematrix is needed') ||
    message.includes('Failed to configure output pad on auto_aresample') ||
    message.includes('Error reinitializing filters')
  );
}

export function isDouyinTransientMediaError(message: string): boolean {
  const normalizedMessage: string = message.toLowerCase();
  return (
    normalizedMessage.includes('end of file') ||
    normalizedMessage.includes('io error') ||
    normalizedMessage.includes('socket hang up') ||
    normalizedMessage.includes('connection reset') ||
    normalizedMessage.includes('fetch failed') ||
    normalizedMessage.includes('network error') ||
    normalizedMessage.includes('http 408') ||
    normalizedMessage.includes('http 429') ||
    /http 5\d\d/u.test(normalizedMessage)
  );
}

export function isFreshPlatformCookieError(message: string): boolean {
  return /fresh cookies.*needed/iu.test(message);
}

export function isDouyinPublicAudioUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'douyinvod.com' ||
        url.hostname.endsWith('.douyinvod.com')) &&
      url.pathname.includes('/media-audio-')
    );
  } catch {
    return false;
  }
}

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
    const isLocalLoopback =
      isLocalRuntime() &&
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (url.protocol !== 'https:' && !isLocalLoopback) {
      throw new Error('unsafe');
    }
    if (url.protocol === 'https:' && isPrivateHostname(url.hostname)) {
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
    input.fileSize > MAX_MEDIA_SIZE_BYTES
  ) {
    throw new BadRequestException('文件不能超过 10 GB');
  }
  if (!input.mimeType.startsWith(MEDIA_MIME_PREFIX[sourceType])) {
    throw new BadRequestException(
      sourceType === 'video' ? '请选择有效的视频文件' : '请选择有效的录音文件',
    );
  }
  validateMediaDownloadUrl(input.downloadUrl);
  if (input.parts) {
    if (input.parts.length === 0 || input.parts.length > MAX_MEDIA_PART_COUNT) {
      throw new BadRequestException('上传分片数量无效');
    }
    const partSize: number = input.parts.reduce(
      (total: number, part: { downloadUrl: string; fileSize: number }) => {
        if (
          !Number.isFinite(part.fileSize) ||
          part.fileSize <= 0 ||
          part.fileSize > MAX_MEDIA_PART_SIZE_BYTES
        ) {
          throw new BadRequestException('上传分片大小无效');
        }
        validateMediaDownloadUrl(part.downloadUrl);
        return total + part.fileSize;
      },
      0,
    );
    if (partSize !== input.fileSize) {
      throw new BadRequestException('上传分片大小与文件大小不一致');
    }
  }
  return {
    ...input,
    fileName: input.fileName.trim().slice(0, 240),
    mimeType: input.mimeType.trim().toLowerCase(),
  };
}

export function validateDocumentInput(
  input: UploadedMediaInput,
): UploadedMediaInput {
  if (!input.fileName?.trim() || !input.mimeType?.trim()) {
    throw new BadRequestException('文件信息不完整');
  }
  if (
    !Number.isFinite(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > MAX_DOCUMENT_SIZE_BYTES
  ) {
    throw new BadRequestException('单个文档不能超过 200 MB');
  }
  if (!isSupportedDocumentFile(input.fileName)) {
    throw new BadRequestException(
      '仅支持 PDF、Word、PowerPoint、TXT 和 Markdown 文档',
    );
  }
  validateMediaDownloadUrl(input.downloadUrl);
  return {
    ...input,
    fileName: input.fileName.trim().slice(0, 240),
    mimeType: getDocumentMimeType(input.fileName) || input.mimeType,
  };
}

export function validateNoteJobRequest(
  input: CreateNoteJobRequest,
): ValidatedNoteJobInput {
  const sourceType: NoteSourceType = input.sourceType || 'platform';
  const noteStyle: NoteStyle = validateNoteStyle(input.noteStyle);
  const visualOptions: NoteVisualOptions = supportsVisualProcessing(sourceType)
    ? normalizeVisualOptions(input.visualOptions)
    : { mode: 'disabled' };
  const transcriptionOptions: TranscriptionOptions = normalizeTranscriptionOptions(
    input.transcriptionOptions,
  );
  if (sourceType === 'platform') {
    if (!input.url?.trim()) {
      throw new BadRequestException('请粘贴需要处理的视频地址');
    }
    return { sourceType, noteStyle, url: input.url, visualOptions };
  }
  if (sourceType === 'paired') {
    if (!input.pairedMedia) {
      throw new BadRequestException('请选择主视频和辅助录音');
    }
    const video: UploadedMediaInput = validateMediaInput(
      input.pairedMedia.video,
      'video',
    );
    let auxiliaryAudio: UploadedMediaInput;
    try {
      auxiliaryAudio = validateMediaInput(
        input.pairedMedia.auxiliaryAudio,
        'audio',
      );
    } catch {
      throw new BadRequestException('请选择有效的辅助录音');
    }
    if (video.fileSize + auxiliaryAudio.fileSize > MAX_MEDIA_SIZE_BYTES) {
      throw new BadRequestException('视频和辅助录音累计不能超过 10 GB');
    }
    const alignment = input.pairedMedia.alignment || { mode: 'auto' as const };
    if (!['auto', 'manual'].includes(alignment.mode)) {
      throw new BadRequestException('不支持的时间对齐方式');
    }
    if (
      alignment.mode === 'manual' &&
      (!Number.isFinite(alignment.audioOffsetMs) ||
        Math.abs(alignment.audioOffsetMs || 0) > 4 * 60 * 60 * 1_000)
    ) {
      throw new BadRequestException('请填写有效的手动时间偏移');
    }
    return {
      sourceType,
      noteStyle,
      pairedMedia: {
        video,
        auxiliaryAudio,
        alignment: {
          mode: alignment.mode,
          audioOffsetMs:
            alignment.mode === 'manual' ? alignment.audioOffsetMs : undefined,
        },
      },
      visualOptions,
    };
  }
  if (
    sourceType !== 'video' &&
    sourceType !== 'audio' &&
    sourceType !== 'pdf' &&
    sourceType !== 'document'
  ) {
    throw new BadRequestException('不支持的内容来源');
  }
  const mediaItems: UploadedMediaInput[] =
    (sourceType === 'video' ||
      sourceType === 'audio' ||
      sourceType === 'document' ||
      sourceType === 'pdf') &&
    input.mediaItems?.length
      ? input.mediaItems
      : input.media
        ? [input.media]
        : [];
  if (!mediaItems.length) {
    throw new BadRequestException(
      sourceType === 'video'
        ? '请选择需要处理的视频文件'
        : sourceType === 'audio'
          ? '请选择需要处理的录音文件'
          : '请选择需要处理的文档文件',
    );
  }
  if (sourceType === 'pdf' || sourceType === 'document') {
    if (mediaItems.length > MAX_DOCUMENT_COUNT) {
      throw new BadRequestException(
        `一次最多处理 ${MAX_DOCUMENT_COUNT} 个文档`,
      );
    }
    const validatedMediaItems: UploadedMediaInput[] = mediaItems.map(
      (media: UploadedMediaInput) => validateDocumentInput(media),
    );
    const totalDocumentSize: number = validatedMediaItems.reduce(
      (total: number, media: UploadedMediaInput) => total + media.fileSize,
      0,
    );
    if (totalDocumentSize > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException('所有文档累计不能超过 200 MB');
    }
    return {
      sourceType,
      noteStyle,
      mediaItems: validatedMediaItems,
      visualOptions,
    };
  }
  if (sourceType !== 'video' && sourceType !== 'audio') {
    throw new BadRequestException('不支持的内容来源');
  }
  if (sourceType === 'video' && mediaItems.length > 10) {
    throw new BadRequestException('一次最多处理 10 个视频');
  }
  const validatedMediaItems: UploadedMediaInput[] = mediaItems.map(
    (media: UploadedMediaInput) => validateMediaInput(media, sourceType),
  );
  const totalMediaSize: number = validatedMediaItems.reduce(
    (total: number, media: UploadedMediaInput) => total + media.fileSize,
    0,
  );
  if (totalMediaSize > MAX_MEDIA_SIZE_BYTES) {
    throw new BadRequestException('所有视频累计不能超过 10 GB');
  }
  return {
    sourceType,
    noteStyle,
    mediaItems: validatedMediaItems,
    transcriptionOptions,
    visualOptions,
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
