import type {
  CreateNoteJobRequest,
  RetainedNoteSource,
  StoredSourceObject,
} from '../../shared/api.interface';
import {
  captureRetainedNoteSource,
  listRetainedSourceObjects,
  materializeRetainedNoteSource,
  parseRetainedNoteSource,
  removeRetainedSourceObjects,
  retainedNoteSourceContentMatches,
  retainedNoteSourcesMatch,
  summarizeRetainedNoteSource,
} from '../../shared/note-reprocessing.utils';

describe('note reprocessing source lifecycle', () => {
  const storedVideo: StoredSourceObject = {
    bucketId: 'bucket-a',
    filePath: 'uploads/lesson.mp4',
    fileSize: 1024,
    id: 'asset-video',
  };
  const storedAudioPartOne: StoredSourceObject = {
    bucketId: 'bucket-a',
    filePath: 'uploads/audio.part-1',
    fileSize: 512,
    id: 'asset-audio-1',
  };
  const storedAudioPartTwo: StoredSourceObject = {
    bucketId: 'bucket-a',
    filePath: 'uploads/audio.part-2',
    fileSize: 512,
    id: 'asset-audio-2',
  };

  it('captures reusable storage metadata without persisting signed URLs', () => {
    const input: CreateNoteJobRequest = {
      mediaItems: [
        {
          downloadUrl: 'https://signed.example.com/lesson.mp4?secret=temporary',
          fileName: 'lesson.mp4',
          fileSize: 1024,
          mimeType: 'video/mp4',
          storage: storedVideo,
        },
      ],
      noteStyle: 'learning',
      sourceType: 'video',
      visualOptions: { mode: 'disabled' },
    };

    const source: RetainedNoteSource | null =
      captureRetainedNoteSource(input);

    expect(source?.sourceType).toBe('video');
    expect(JSON.stringify(source)).not.toContain('signed.example.com');
    expect(listRetainedSourceObjects(source)).toEqual([storedVideo]);
  });

  it('rebuilds a chunked full-reprocess request with fresh signed URLs', () => {
    const source: RetainedNoteSource = {
      mediaItems: [
        {
          fileName: 'meeting.m4a',
          fileSize: 1024,
          mimeType: 'audio/mp4',
          objects: [storedAudioPartOne, storedAudioPartTwo],
          partCount: 2,
        },
      ],
      noteStyle: 'meeting',
      sourceType: 'audio',
      visualOptions: { mode: 'disabled' },
    };

    const request: CreateNoteJobRequest = materializeRetainedNoteSource(
      source,
      {
        'asset-audio-1': 'https://fresh.example.com/audio.part-1',
        'asset-audio-2': 'https://fresh.example.com/audio.part-2',
      },
    );

    expect(request.mediaItems?.[0].parts).toEqual([
      {
        downloadUrl: 'https://fresh.example.com/audio.part-1',
        fileSize: 512,
        storage: storedAudioPartOne,
      },
      {
        downloadUrl: 'https://fresh.example.com/audio.part-2',
        fileSize: 512,
        storage: storedAudioPartTwo,
      },
    ]);
    expect(request.mediaItems?.[0].downloadUrl).toBe(
      'https://fresh.example.com/audio.part-1',
    );
  });

  it('marks a source partial after one object is manually deleted', () => {
    const source: RetainedNoteSource = {
      mediaItems: [
        {
          fileName: 'meeting.m4a',
          fileSize: 1024,
          mimeType: 'audio/mp4',
          objects: [storedAudioPartOne, storedAudioPartTwo],
          partCount: 2,
        },
      ],
      noteStyle: 'meeting',
      sourceType: 'audio',
      visualOptions: { mode: 'disabled' },
    };

    const next: RetainedNoteSource | null = removeRetainedSourceObjects(
      source,
      ['asset-audio-1'],
    );

    expect(summarizeRetainedNoteSource(next, null).status).toBe('partial');
    expect(listRetainedSourceObjects(next)).toEqual([storedAudioPartTwo]);
  });

  it('marks a source deleted after all stored objects are removed', () => {
    const source: RetainedNoteSource = {
      mediaItems: [
        {
          fileName: 'lesson.mp4',
          fileSize: 1024,
          mimeType: 'video/mp4',
          objects: [storedVideo],
          partCount: 1,
        },
      ],
      noteStyle: 'learning',
      sourceType: 'video',
      visualOptions: { mode: 'disabled' },
    };

    const next: RetainedNoteSource | null = removeRetainedSourceObjects(
      source,
      ['asset-video'],
    );
    const summary = summarizeRetainedNoteSource(
      next,
      '2026-07-29T12:00:00.000Z',
    );

    expect(next).toBeNull();
    expect(summary.status).toBe('deleted');
    expect(summary.deletedAt).toBe('2026-07-29T12:00:00.000Z');
  });

  it('keeps platform links remotely reusable without storage objects', () => {
    const source: RetainedNoteSource | null = captureRetainedNoteSource({
      noteStyle: 'learning',
      sourcePlatform: 'bilibili',
      sourceType: 'platform',
      url: 'https://www.bilibili.com/video/BV1example',
      visualOptions: { mode: 'disabled' },
    });

    expect(summarizeRetainedNoteSource(source, null).status).toBe('remote');
    expect(materializeRetainedNoteSource(source!, {})).toMatchObject({
      sourcePlatform: 'bilibili',
      sourceType: 'platform',
      url: 'https://www.bilibili.com/video/BV1example',
    });
  });

  it('rejects malformed persisted source snapshots', () => {
    expect(parseRetainedNoteSource('{"sourceType":"video"}')).toBeNull();
    expect(parseRetainedNoteSource('not-json')).toBeNull();
  });

  it('does not retain malformed client storage metadata', () => {
    const source: RetainedNoteSource | null = captureRetainedNoteSource({
      mediaItems: [
        {
          downloadUrl: 'https://signed.example.com/lesson.mp4',
          fileName: 'lesson.mp4',
          fileSize: 1024,
          mimeType: 'video/mp4',
          storage: {
            ...storedVideo,
            filePath: '',
          },
        },
      ],
      sourceType: 'video',
    });

    expect(source).toBeNull();
  });

  it('detects a reprocess request that swaps the retained storage object', () => {
    const expected: RetainedNoteSource = {
      mediaItems: [
        {
          fileName: 'lesson.mp4',
          fileSize: 1024,
          mimeType: 'video/mp4',
          objects: [storedVideo],
          partCount: 1,
        },
      ],
      noteStyle: 'learning',
      sourceType: 'video',
      visualOptions: { mode: 'disabled' },
    };
    const tampered: RetainedNoteSource = {
      ...expected,
      mediaItems: [
        {
          ...expected.mediaItems[0],
          objects: [
            {
              ...storedVideo,
              filePath: 'uploads/another-user.mp4',
            },
          ],
        },
      ],
    };

    expect(retainedNoteSourcesMatch(expected, tampered)).toBe(false);
    expect(retainedNoteSourcesMatch(expected, expected)).toBe(true);
  });

  it('allows a reprocess to change only image processing options', () => {
    const original: RetainedNoteSource = {
      noteStyle: 'learning',
      sourcePlatform: 'bilibili',
      sourceType: 'platform',
      url: 'https://www.bilibili.com/video/BV1example',
      visualOptions: { mode: 'disabled' },
    };
    const changedVisualOptions: RetainedNoteSource = {
      ...original,
      visualOptions: {
        allowExternalAi: true,
        density: 'standard',
        mode: 'automatic',
        outputMode: 'original_with_ai_notes',
      },
    };

    expect(retainedNoteSourcesMatch(original, changedVisualOptions)).toBe(false);
    expect(retainedNoteSourceContentMatches(original, changedVisualOptions)).toBe(true);
  });
});
