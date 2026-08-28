import type {
  CreateNoteJobRequest,
  NoteSourceAssetSummary,
  NoteVisualOptions,
  RetainedNoteSource,
  RetainedUploadedMedia,
  StoredSourceObject,
  TranscriptionLanguageMode,
  TranscriptionOptions,
  UploadedMediaInput,
  UploadedMediaPart,
} from './api.interface';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredSourceObject(value: unknown): value is StoredSourceObject {
  return (
    isRecord(value) &&
    typeof value.bucketId === 'string' &&
    value.bucketId.trim().length > 0 &&
    value.bucketId.length <= 255 &&
    typeof value.filePath === 'string' &&
    value.filePath.trim().length > 0 &&
    value.filePath.length <= 2_048 &&
    typeof value.fileSize === 'number' &&
    Number.isFinite(value.fileSize) &&
    value.fileSize > 0 &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    value.id.length <= 255
  );
}

function isVisualOptions(value: unknown): value is NoteVisualOptions {
  if (!isRecord(value) || typeof value.mode !== 'string') return false;
  if (value.mode === 'disabled') return true;
  return (
    (value.mode === 'automatic' || value.mode === 'review') &&
    typeof value.allowExternalAi === 'boolean' &&
    (value.density === 'compact' ||
      value.density === 'standard' ||
      value.density === 'detailed') &&
    (value.outputMode === 'original' ||
      value.outputMode === 'original_with_ai_notes' ||
      value.outputMode === 'original_with_ai_derivative')
  );
}

function parseTranscriptionOptions(value: unknown): TranscriptionOptions | undefined {
  if (!isRecord(value)) return undefined;
  const modes: readonly TranscriptionLanguageMode[] = ['mandarin', 'sichuan', 'cantonese', 'mixed', 'auto'];
  const languageMode = modes.includes(value.languageMode as TranscriptionLanguageMode)
    ? value.languageMode as TranscriptionLanguageMode
    : undefined;
  const hotwords = Array.isArray(value.hotwords)
    ? value.hotwords.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 128)
    : [];
  return languageMode || hotwords.length ? { languageMode, ...(hotwords.length ? { hotwords } : {}) } : undefined;
}

function parseRetainedUploadedMedia(
  value: unknown,
): RetainedUploadedMedia | null {
  if (
    !isRecord(value) ||
    typeof value.fileName !== 'string' ||
    typeof value.fileSize !== 'number' ||
    typeof value.mimeType !== 'string' ||
    typeof value.partCount !== 'number' ||
    !Array.isArray(value.objects) ||
    !value.objects.every(isStoredSourceObject)
  ) {
    return null;
  }
  return {
    fileName: value.fileName,
    fileSize: value.fileSize,
    mimeType: value.mimeType,
    objects: value.objects,
    partCount: value.partCount,
  };
}

function parseUploadedSource(
  value: Record<string, unknown>,
): RetainedNoteSource | null {
  if (
    value.sourceType !== 'video' &&
    value.sourceType !== 'audio' &&
    value.sourceType !== 'document' &&
    value.sourceType !== 'pdf'
  ) {
    return null;
  }
  if (
    (value.noteStyle !== 'learning' && value.noteStyle !== 'meeting') ||
    !isVisualOptions(value.visualOptions) ||
    !Array.isArray(value.mediaItems)
  ) {
    return null;
  }
  const mediaItems: RetainedUploadedMedia[] = value.mediaItems.flatMap(
    (item: unknown): RetainedUploadedMedia[] => {
      const media: RetainedUploadedMedia | null =
        parseRetainedUploadedMedia(item);
      return media ? [media] : [];
    },
  );
  if (mediaItems.length !== value.mediaItems.length || mediaItems.length === 0) {
    return null;
  }
  return {
    mediaItems,
    noteStyle: value.noteStyle,
    sourceType: value.sourceType,
    transcriptionOptions: parseTranscriptionOptions(value.transcriptionOptions),
    visualOptions: value.visualOptions,
  };
}

function parsePairedSource(
  value: Record<string, unknown>,
): RetainedNoteSource | null {
  if (
    value.sourceType !== 'paired' ||
    (value.noteStyle !== 'learning' && value.noteStyle !== 'meeting') ||
    !isVisualOptions(value.visualOptions) ||
    !isRecord(value.pairedMedia) ||
    !isRecord(value.pairedMedia.alignment)
  ) {
    return null;
  }
  const alignment = value.pairedMedia.alignment;
  const audioOffsetMs: unknown = alignment.audioOffsetMs;
  if (alignment.mode !== 'auto' && alignment.mode !== 'manual') {
    return null;
  }
  if (audioOffsetMs !== undefined && typeof audioOffsetMs !== 'number') {
    return null;
  }
  const video: RetainedUploadedMedia | null = parseRetainedUploadedMedia(
    value.pairedMedia.video,
  );
  const auxiliaryAudio: RetainedUploadedMedia | null =
    parseRetainedUploadedMedia(value.pairedMedia.auxiliaryAudio);
  if (!video || !auxiliaryAudio) return null;
  return {
    noteStyle: value.noteStyle,
    pairedMedia: {
      alignment: {
        audioOffsetMs:
          typeof audioOffsetMs === 'number' ? audioOffsetMs : undefined,
        mode: alignment.mode,
      },
      auxiliaryAudio,
      video,
    },
    sourceType: value.sourceType,
    visualOptions: value.visualOptions,
  };
}

function parsePlatformSource(
  value: Record<string, unknown>,
): RetainedNoteSource | null {
  if (
    value.sourceType !== 'platform' ||
    (value.noteStyle !== 'learning' && value.noteStyle !== 'meeting') ||
    (value.sourcePlatform !== 'bilibili' &&
      value.sourcePlatform !== 'douyin') ||
    typeof value.url !== 'string' ||
    !isVisualOptions(value.visualOptions)
  ) {
    return null;
  }
  const cookieBrowser =
    value.cookieBrowser === 'chrome' ||
    value.cookieBrowser === 'safari' ||
    value.cookieBrowser === 'edge' ||
    value.cookieBrowser === 'firefox'
      ? value.cookieBrowser
      : undefined;
  return {
    cookieBrowser,
    noteStyle: value.noteStyle,
    sourcePlatform: value.sourcePlatform,
    sourceType: value.sourceType,
    url: value.url,
    visualOptions: value.visualOptions,
  };
}

export function parseRetainedNoteSource(
  sourceJson: string | null,
): RetainedNoteSource | null {
  if (!sourceJson?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(sourceJson);
    if (!isRecord(parsed)) return null;
    return (
      parsePlatformSource(parsed) ||
      parsePairedSource(parsed) ||
      parseUploadedSource(parsed)
    );
  } catch {
    return null;
  }
}

export function retainedNoteSourcesMatch(
  expected: RetainedNoteSource,
  actual: RetainedNoteSource,
): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

export function retainedNoteSourceContentMatches(
  expected: RetainedNoteSource,
  actual: RetainedNoteSource,
): boolean {
  return (
    expected.sourceType === actual.sourceType &&
    JSON.stringify({ ...expected, visualOptions: { mode: 'disabled' } }) ===
      JSON.stringify({ ...actual, visualOptions: { mode: 'disabled' } })
  );
}

function copyStoredObject(
  source: StoredSourceObject,
  fileSize: number,
): StoredSourceObject | null {
  if (!isStoredSourceObject(source) || source.fileSize !== fileSize) {
    return null;
  }
  return {
    bucketId: source.bucketId,
    filePath: source.filePath,
    fileSize,
    id: source.id,
  };
}

function captureUploadedMedia(
  media: UploadedMediaInput,
): RetainedUploadedMedia | null {
  const parts: UploadedMediaPart[] | undefined = media.parts;
  const capturedObjects: Array<StoredSourceObject | null> = parts?.length
    ? parts.map(
        (part: UploadedMediaPart): StoredSourceObject | null =>
          part.storage
            ? copyStoredObject(part.storage, part.fileSize)
            : null,
      )
    : [
        media.storage
          ? copyStoredObject(media.storage, media.fileSize)
          : null,
      ];
  const objects: StoredSourceObject[] = capturedObjects.filter(
    (object: StoredSourceObject | null): object is StoredSourceObject =>
      object !== null,
  );
  const partCount: number = parts?.length || 1;
  if (
    objects.length !== partCount ||
    new Set(objects.map((object: StoredSourceObject): string => object.id))
      .size !== objects.length
  ) {
    return null;
  }
  return {
    fileName: media.fileName,
    fileSize: media.fileSize,
    mimeType: media.mimeType,
    objects,
    partCount,
  };
}

function getVisualOptions(
  input: CreateNoteJobRequest,
): NoteVisualOptions {
  return input.visualOptions || { mode: 'disabled' };
}

export function captureRetainedNoteSource(
  input: CreateNoteJobRequest,
): RetainedNoteSource | null {
  const noteStyle = input.noteStyle || 'learning';
  const sourceType = input.sourceType || 'platform';
  const visualOptions: NoteVisualOptions = getVisualOptions(input);
  if (sourceType === 'platform') {
    if (!input.url?.trim() || !input.sourcePlatform) return null;
    return {
      cookieBrowser: input.cookieBrowser,
      noteStyle,
      sourcePlatform: input.sourcePlatform,
      sourceType,
      url: input.url.trim(),
      visualOptions,
    };
  }
  if (sourceType === 'paired') {
    if (!input.pairedMedia) return null;
    const video: RetainedUploadedMedia | null = captureUploadedMedia(
      input.pairedMedia.video,
    );
    const auxiliaryAudio: RetainedUploadedMedia | null = captureUploadedMedia(
      input.pairedMedia.auxiliaryAudio,
    );
    if (!video || !auxiliaryAudio) return null;
    return {
      noteStyle,
      pairedMedia: {
        alignment: input.pairedMedia.alignment,
        auxiliaryAudio,
        video,
      },
      sourceType,
      visualOptions,
    };
  }
  const mediaItems: UploadedMediaInput[] = input.mediaItems?.length
    ? input.mediaItems
    : input.media
      ? [input.media]
      : [];
  const retainedItems: RetainedUploadedMedia[] = mediaItems.flatMap(
    (media: UploadedMediaInput): RetainedUploadedMedia[] => {
      const retained: RetainedUploadedMedia | null =
        captureUploadedMedia(media);
      return retained ? [retained] : [];
    },
  );
  if (retainedItems.length !== mediaItems.length || retainedItems.length === 0) {
    return null;
  }
  return {
    mediaItems: retainedItems,
    noteStyle,
    sourceType,
    transcriptionOptions: input.transcriptionOptions,
    visualOptions,
  };
}

function listRetainedMedia(
  source: RetainedNoteSource,
): RetainedUploadedMedia[] {
  if (source.sourceType === 'platform') return [];
  if (source.sourceType === 'paired') {
    return [source.pairedMedia.video, source.pairedMedia.auxiliaryAudio];
  }
  return source.mediaItems;
}

export function listRetainedSourceObjects(
  source: RetainedNoteSource | null,
): StoredSourceObject[] {
  if (!source) return [];
  return listRetainedMedia(source).flatMap(
    (media: RetainedUploadedMedia): StoredSourceObject[] => media.objects,
  );
}

function materializeUploadedMedia(
  media: RetainedUploadedMedia,
  signedUrls: Readonly<Record<string, string>>,
): UploadedMediaInput {
  const urls: string[] = media.objects.map(
    (object: StoredSourceObject): string => {
      const signedUrl: string | undefined = signedUrls[object.id];
      if (!signedUrl) {
        throw new Error(`源文件 ${media.fileName} 缺少可用下载地址`);
      }
      return signedUrl;
    },
  );
  if (media.objects.length !== media.partCount || urls.length === 0) {
    throw new Error(`源文件 ${media.fileName} 不完整，无法重新处理`);
  }
  const firstObject: StoredSourceObject = media.objects[0];
  return {
    downloadUrl: urls[0],
    fileName: media.fileName,
    fileSize: media.fileSize,
    mimeType: media.mimeType,
    parts:
      media.partCount > 1
        ? media.objects.map(
            (
              object: StoredSourceObject,
              index: number,
            ): UploadedMediaPart => ({
              downloadUrl: urls[index],
              fileSize: object.fileSize,
              storage: object,
            }),
          )
        : undefined,
    storage: media.partCount === 1 ? firstObject : undefined,
  };
}

export function materializeRetainedNoteSource(
  source: RetainedNoteSource,
  signedUrls: Readonly<Record<string, string>>,
): CreateNoteJobRequest {
  if (source.sourceType === 'platform') {
    return {
      cookieBrowser: source.cookieBrowser,
      noteStyle: source.noteStyle,
      sourcePlatform: source.sourcePlatform,
      sourceType: source.sourceType,
      url: source.url,
      visualOptions: source.visualOptions,
    };
  }
  if (source.sourceType === 'paired') {
    return {
      noteStyle: source.noteStyle,
      pairedMedia: {
        alignment: source.pairedMedia.alignment,
        auxiliaryAudio: materializeUploadedMedia(
          source.pairedMedia.auxiliaryAudio,
          signedUrls,
        ),
        video: materializeUploadedMedia(
          source.pairedMedia.video,
          signedUrls,
        ),
      },
      sourceType: source.sourceType,
      visualOptions: source.visualOptions,
    };
  }
  return {
    mediaItems: source.mediaItems.map(
      (media: RetainedUploadedMedia): UploadedMediaInput =>
        materializeUploadedMedia(media, signedUrls),
    ),
    noteStyle: source.noteStyle,
    sourceType: source.sourceType,
    transcriptionOptions: source.transcriptionOptions,
    visualOptions: source.visualOptions,
  };
}

function removeObjectsFromMedia(
  media: RetainedUploadedMedia,
  deletedIds: ReadonlySet<string>,
): RetainedUploadedMedia {
  return {
    ...media,
    objects: media.objects.filter(
      (object: StoredSourceObject): boolean => !deletedIds.has(object.id),
    ),
  };
}

export function removeRetainedSourceObjects(
  source: RetainedNoteSource | null,
  objectIds: readonly string[],
): RetainedNoteSource | null {
  if (!source || source.sourceType === 'platform') return source;
  const deletedIds: ReadonlySet<string> = new Set(objectIds);
  if (source.sourceType === 'paired') {
    const next: RetainedNoteSource = {
      ...source,
      pairedMedia: {
        ...source.pairedMedia,
        auxiliaryAudio: removeObjectsFromMedia(
          source.pairedMedia.auxiliaryAudio,
          deletedIds,
        ),
        video: removeObjectsFromMedia(
          source.pairedMedia.video,
          deletedIds,
        ),
      },
    };
    return listRetainedSourceObjects(next).length > 0 ? next : null;
  }
  const next: RetainedNoteSource = {
    ...source,
    mediaItems: source.mediaItems.map(
      (media: RetainedUploadedMedia): RetainedUploadedMedia =>
        removeObjectsFromMedia(media, deletedIds),
    ),
  };
  return listRetainedSourceObjects(next).length > 0 ? next : null;
}

export function summarizeRetainedNoteSource(
  source: RetainedNoteSource | null,
  deletedAt: string | null,
): NoteSourceAssetSummary {
  if (!source) {
    return {
      deletedAt,
      fileCount: 0,
      fileNames: [],
      objectCount: 0,
      status: deletedAt ? 'deleted' : 'unavailable',
      totalBytes: 0,
    };
  }
  if (source.sourceType === 'platform') {
    return {
      deletedAt: null,
      fileCount: 0,
      fileNames: [],
      objectCount: 0,
      status: 'remote',
      totalBytes: 0,
    };
  }
  const mediaItems: RetainedUploadedMedia[] = listRetainedMedia(source);
  const objectCount: number = listRetainedSourceObjects(source).length;
  const complete: boolean = mediaItems.every(
    (media: RetainedUploadedMedia): boolean =>
      media.objects.length === media.partCount && media.partCount > 0,
  );
  return {
    deletedAt,
    fileCount: mediaItems.length,
    fileNames: mediaItems.map(
      (media: RetainedUploadedMedia): string => media.fileName,
    ),
    objectCount,
    status: objectCount === 0 ? 'deleted' : complete ? 'retained' : 'partial',
    totalBytes: mediaItems.reduce(
      (total: number, media: RetainedUploadedMedia): number =>
        total + media.fileSize,
      0,
    ),
  };
}
