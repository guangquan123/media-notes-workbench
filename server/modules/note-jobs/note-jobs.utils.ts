import { BadRequestException } from '@nestjs/common';
import type {
  CreateNoteJobRequest,
  NoteStyle,
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
  noteStyle: NoteStyle;
  url: string;
}

interface MediaJobInput {
  sourceType: 'video' | 'audio';
  noteStyle: NoteStyle;
  media: UploadedMediaInput;
}

type ValidatedNoteJobInput = PlatformJobInput | MediaJobInput;

const NOTE_STYLES: readonly NoteStyle[] = [
  'systematic',
  'concise',
  'actionable',
  'meeting',
];

const NOTE_STYLE_REQUIREMENTS: Record<NoteStyle, string> = {
  systematic:
    '系统学习型：完整保留概念、原理、因果关系、案例、边界与复习卡片，适合深入学习和长期复习。',
  concise:
    '精简速记型：优先结论和高密度要点，删除非必要展开，控制篇幅，适合快速回顾。',
  actionable:
    '实操手册型：突出前置条件、操作步骤、检查点、示例、常见错误和可执行清单。',
  meeting:
    '会议纪要型：按议题整理讨论、结论、决策、待办、负责人和时间；原文未提供负责人或时间时标记待确认。',
};

export function validateNoteStyle(value?: string): NoteStyle {
  if (!value) return 'systematic';
  if (NOTE_STYLES.includes(value as NoteStyle)) {
    return value as NoteStyle;
  }
  throw new BadRequestException('不支持的笔记风格');
}

export function getNoteStyleRequirement(noteStyle: NoteStyle): string {
  return NOTE_STYLE_REQUIREMENTS[noteStyle];
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
    noteStyle,
    media: validateMediaInput(input.media, sourceType),
  };
}
