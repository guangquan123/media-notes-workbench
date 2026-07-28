import {
  calculateDurationMs,
  formatDuration,
  getConversionTypeLabel,
  normalizeHistoryDateRange,
  normalizeHistoryPagination,
} from '../../server/modules/note-jobs/note-history.utils';

describe('note conversion history utilities', () => {
  it('calculates conversion duration from start and completion times', () => {
    const startedAt = new Date('2026-07-05T02:00:00.000Z');
    const completedAt = new Date('2026-07-05T02:03:42.500Z');

    expect(calculateDurationMs(startedAt, completedAt)).toBe(222500);
  });

  it('never returns a negative duration', () => {
    const startedAt = new Date('2026-07-05T02:03:42.500Z');
    const completedAt = new Date('2026-07-05T02:00:00.000Z');

    expect(calculateDurationMs(startedAt, completedAt)).toBe(0);
  });

  it('formats short and long conversion durations for display', () => {
    expect(formatDuration(42000)).toBe('42 秒');
    expect(formatDuration(222500)).toBe('3 分 43 秒');
    expect(formatDuration(null)).toBe('处理中');
  });

  it('maps each note source to a stable user-facing type label', () => {
    expect(getConversionTypeLabel('platform', 'bilibili')).toBe('B站视频');
    expect(getConversionTypeLabel('platform', 'douyin')).toBe('抖音视频');
    expect(getConversionTypeLabel('video')).toBe('本地视频');
    expect(getConversionTypeLabel('audio')).toBe('录音');
    expect(getConversionTypeLabel('paired')).toBe('双源会议/培训');
    expect(getConversionTypeLabel('document')).toBe('文档资料');
  });

  it('normalizes history pagination to the supported page size and range', () => {
    expect(normalizeHistoryPagination('0', '999')).toEqual({
      page: 1,
      pageSize: 10,
    });
    expect(normalizeHistoryPagination('3', '10')).toEqual({
      page: 3,
      pageSize: 10,
    });
  });

  it('converts an inclusive Shanghai date range to database boundaries', () => {
    const range = normalizeHistoryDateRange('2026-07-16', '2026-07-17');

    expect(range.startedAtFrom?.toISOString()).toBe('2026-07-15T16:00:00.000Z');
    expect(range.startedAtBefore?.toISOString()).toBe(
      '2026-07-17T16:00:00.000Z',
    );
  });

  it('rejects inverted or malformed history date ranges', () => {
    expect(() => normalizeHistoryDateRange('2026-07-18', '2026-07-17')).toThrow(
      '开始日期不能晚于结束日期',
    );
    expect(() => normalizeHistoryDateRange('2026-7-17')).toThrow(
      '日期格式应为 YYYY-MM-DD',
    );
    expect(() => normalizeHistoryDateRange('2026-02-31')).toThrow(
      '日期格式应为 YYYY-MM-DD',
    );
  });
});
