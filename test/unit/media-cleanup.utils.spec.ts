import {
  DEFAULT_MEDIA_CLEANUP_CONFIG,
  getMediaCleanupRunKey,
  getNextMediaCleanupRunAt,
  isMediaCleanupDue,
  normalizeMediaCleanupSettings,
  type StoredMediaCleanupConfig,
} from '../../server/modules/note-jobs/media-cleanup.utils';

function config(
  overrides: Partial<StoredMediaCleanupConfig> = {},
): StoredMediaCleanupConfig {
  return {
    ...DEFAULT_MEDIA_CLEANUP_CONFIG,
    enabled: true,
    ownerId: 'user-1',
    ...overrides,
  };
}

describe('media cleanup schedule', () => {
  it('runs a daily schedule once after the configured Shanghai time', () => {
    const now = new Date('2026-08-31T01:30:00.000Z');
    const current = config({ frequency: 'daily', scheduledTime: '09:00' });

    expect(isMediaCleanupDue(current, now)).toBe(true);
    expect(
      isMediaCleanupDue(
        { ...current, lastRunKey: getMediaCleanupRunKey('daily', now) },
        now,
      ),
    ).toBe(false);
  });

  it('catches up a weekly schedule later in the same week', () => {
    const current = config({
      frequency: 'weekly',
      scheduledTime: '03:00',
      weeklyDay: 1,
    });
    expect(
      isMediaCleanupDue(current, new Date('2026-09-02T02:00:00.000Z')),
    ).toBe(true);
  });

  it('calculates the next monthly run in Shanghai time', () => {
    const current = config({
      frequency: 'monthly',
      monthlyDay: 5,
      scheduledTime: '03:30',
    });
    expect(
      getNextMediaCleanupRunAt(current, new Date('2026-08-31T00:00:00.000Z')),
    ).toBe('2026-09-04T19:30:00.000Z');
  });

  it('rejects unsafe retention and schedule values', () => {
    expect(() =>
      normalizeMediaCleanupSettings({
        deleteFailedRecords: false,
        deleteOrphanFiles: true,
        enabled: true,
        frequency: 'daily',
        monthlyDay: 1,
        retentionDays: 0,
        scheduledTime: '25:00',
        weeklyDay: 0,
      }),
    ).toThrow();
  });
});
