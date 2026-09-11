import {
  buildRecordingArchiveFileName,
  buildRecordingMeetingTitle,
  filterRecordingAssets,
  getRecordingFormatLabel,
  normalizeAudioMimeType,
  sortRecordingAssets,
} from '@shared/recording-assets.utils';
import type {
  RecordingAsset,
  RecordingAssetProcessingStatus,
  RecordingAssetStorageStatus,
} from '@shared/api.interface';

function createAsset(
  overrides: Partial<RecordingAsset> = {},
): RecordingAsset {
  return {
    id: 'asset-1',
    title: '客户访谈：需求梳理',
    source: 'microphone',
    mimeType: 'audio/webm',
    fileName: 'recording.webm',
    durationMs: 42_000,
    fileSize: 1024,
    capturedAt: '2026-09-04T06:18:00.000Z',
    createdAt: '2026-09-04T06:18:00.000Z',
    updatedAt: '2026-09-04T06:19:00.000Z',
    storageStatus: 'app_only',
    processingStatus: 'unprocessed',
    media: {
      downloadUrl: 'http://localhost/audio/asset-1',
      fileName: 'recording.webm',
      fileSize: 1024,
      mimeType: 'audio/webm',
    },
    ...overrides,
  };
}

describe('recording-assets.utils', () => {
  it('puts unprocessed and pending-archive assets before completed assets', () => {
    const completed: RecordingAsset = createAsset({
      id: 'completed',
      processingStatus: 'processed' as RecordingAssetProcessingStatus,
      storageStatus: 'archived' as RecordingAssetStorageStatus,
      updatedAt: '2026-09-04T08:00:00.000Z',
    });
    const pending: RecordingAsset = createAsset({
      id: 'pending',
      storageStatus: 'pending_archive' as RecordingAssetStorageStatus,
      updatedAt: '2026-09-04T07:00:00.000Z',
    });

    expect(sortRecordingAssets([completed, pending]).map((item) => item.id)).toEqual([
      'pending',
      'completed',
    ]);
  });

  it('sorts assets with the same priority by updatedAt descending', () => {
    const older: RecordingAsset = createAsset({
      id: 'older',
      updatedAt: '2026-09-04T06:00:00.000Z',
    });
    const newer: RecordingAsset = createAsset({
      id: 'newer',
      updatedAt: '2026-09-04T09:00:00.000Z',
    });

    expect(sortRecordingAssets([older, newer]).map((item) => item.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('filters by keyword across title and file name', () => {
    const matching: RecordingAsset = createAsset({
      id: 'matching',
      title: '产品周会',
      fileName: 'weekly-review.m4a',
    });
    const other: RecordingAsset = createAsset({
      id: 'other',
      title: '客户访谈',
      fileName: 'interview.m4a',
    });

    expect(
      filterRecordingAssets([matching, other], { keyword: 'weekly' }).map(
        (item) => item.id,
      ),
    ).toEqual(['matching']);
  });

  it('filters by processing and storage status together', () => {
    const unprocessed: RecordingAsset = createAsset({ id: 'unprocessed' });
    const failed: RecordingAsset = createAsset({
      id: 'failed',
      processingStatus: 'failed',
      storageStatus: 'archive_failed',
    });

    expect(
      filterRecordingAssets([unprocessed, failed], {
        processingStatus: 'failed',
        storageStatus: 'archive_failed',
      }).map((item) => item.id),
    ).toEqual(['failed']);
  });

  it('matches an empty keyword without excluding any assets', () => {
    const assets: RecordingAsset[] = [createAsset({ id: 'one' }), createAsset({ id: 'two' })];

    expect(filterRecordingAssets(assets, { keyword: '  ' })).toHaveLength(2);
  });

  it('sanitizes Windows-incompatible characters in archive names', () => {
    expect(
      buildRecordingArchiveFileName(
        '客户访谈：需求/梳理*计划',
        '2026-09-04T06:18:00.000Z',
        'audio/webm',
        'asset1234',
      ),
    ).toBe('2026-09-04_14-18_客户访谈-需求-梳理-计划_asset1234.webm');
  });

  it('uses a stable extension for common audio mime types', () => {
    expect(
      buildRecordingArchiveFileName(
        '语音备忘',
        '2026-09-04T06:18:00.000Z',
        'audio/mp4',
        'asset1234',
      ),
    ).toBe('2026-09-04_14-18_语音备忘_asset1234.m4a');
  });

  it('normalizes codec parameters and the common m4a MIME alias', () => {
    expect(normalizeAudioMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeAudioMimeType('audio/x-m4a')).toBe('audio/mp4');
    expect(
      buildRecordingArchiveFileName(
        '语音备忘',
        '2026-09-04T06:18:00.000Z',
        'audio/webm;codecs=opus',
        'asset1234',
      ),
    ).toBe('2026-09-04_14-18_语音备忘_asset1234.webm');
  });

  it('turns technical recording MIME types into readable format labels', () => {
    expect(getRecordingFormatLabel('audio/webm;codecs=opus')).toBe(
      'WebM（Opus 编码）',
    );
    expect(getRecordingFormatLabel('audio/mp4;codecs=mp4a.40.2')).toBe(
      'M4A（AAC 编码）',
    );
  });

  it('uses the recording date and generated meeting topic for the final title', () => {
    expect(
      buildRecordingMeetingTitle(
        '2026-09-04T06:18:00.000Z',
        '# 产品周会：迭代计划',
      ),
    ).toBe('2026-09-04 · 产品周会：迭代计划');
  });

  it('falls back to a safe title when the title is blank', () => {
    expect(
      buildRecordingArchiveFileName(
        '   ',
        '2026-09-04T06:18:00.000Z',
        'audio/wav',
        'asset1234',
      ),
    ).toBe('2026-09-04_14-18_未命名录音_asset1234.wav');
  });
});
