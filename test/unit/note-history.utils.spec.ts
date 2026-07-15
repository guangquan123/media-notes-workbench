import {
  calculateDurationMs,
  formatDuration,
  getConversionTypeLabel,
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
    expect(getConversionTypeLabel('document')).toBe('文档资料');
  });
});
