import {
  getSourceAssetCopy,
  getSourceAssetCapabilities,
} from '../../client/src/pages/ConversionHistoryPage/conversion-history-source.utils';
import type { NoteSourceAssetSummary } from '../../shared/api.interface';

function createSummary(
  overrides: Partial<NoteSourceAssetSummary> = {},
): NoteSourceAssetSummary {
  return {
    deletedAt: null,
    fileCount: 1,
    fileNames: ['访谈.mp4'],
    objectCount: 2,
    status: 'retained',
    totalBytes: 1024,
    ...overrides,
  };
}

describe('conversion history source actions', () => {
  it('allows full reprocessing and deletion for retained uploads', () => {
    expect(getSourceAssetCapabilities(createSummary())).toEqual({
      canDelete: true,
      canReprocess: true,
    });
    expect(getSourceAssetCopy(createSummary())).toBe('源文件已保留 · 2 个对象');
  });

  it('keeps partial deletion visible and retryable', () => {
    const summary: NoteSourceAssetSummary = createSummary({
      objectCount: 1,
      status: 'partial',
    });

    expect(getSourceAssetCapabilities(summary)).toEqual({
      canDelete: true,
      canReprocess: false,
    });
    expect(getSourceAssetCopy(summary)).toBe('源文件删除不完整 · 剩余 1 个对象');
  });

  it('allows remote platform sources to be fetched again without deletion', () => {
    const summary: NoteSourceAssetSummary = createSummary({
      fileCount: 0,
      fileNames: [],
      objectCount: 0,
      status: 'remote',
      totalBytes: 0,
    });

    expect(getSourceAssetCapabilities(summary)).toEqual({
      canDelete: false,
      canReprocess: true,
    });
    expect(getSourceAssetCopy(summary)).toBe('原链接可重新抓取');
  });

  it('explains why legacy records cannot fully reprocess', () => {
    const summary: NoteSourceAssetSummary = createSummary({
      fileCount: 0,
      fileNames: [],
      objectCount: 0,
      status: 'unavailable',
      totalBytes: 0,
    });

    expect(getSourceAssetCapabilities(summary)).toEqual({
      canDelete: false,
      canReprocess: false,
    });
    expect(getSourceAssetCopy(summary)).toBe('未保留可复用源文件');
  });
});
