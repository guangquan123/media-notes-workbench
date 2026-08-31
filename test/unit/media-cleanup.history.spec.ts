import {
  access,
  mkdir,
  mkdtemp,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppDatabase } from '../../server/database/database.types';
import { MediaCleanupService } from '../../server/modules/note-jobs/media-cleanup.service';
import type { NoteHistoryService } from '../../server/modules/note-jobs/note-history.service';

function createDatabase(): AppDatabase {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockResolvedValue([]),
    }),
  } as unknown as AppDatabase;
}

function createHistoryService(): NoteHistoryService {
  return {
    confirmDeletedSourceObjects: jest.fn().mockResolvedValue({}),
  } as unknown as NoteHistoryService;
}

describe('media cleanup history', () => {
  it('persists manual and scheduled runs and isolates records by owner', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'media-cleanup-history-'));
    const uploadDir = join(baseDir, 'data', 'uploads');
    const oldDate = new Date('2025-01-01T00:00:00.000Z');
    try {
      await mkdir(uploadDir, { recursive: true });
      const manualFile = join(uploadDir, 'manual-object');
      await writeFile(manualFile, 'manual');
      await utimes(manualFile, oldDate, oldDate);
      const service = new MediaCleanupService(
        createDatabase(),
        createHistoryService(),
        baseDir,
      );
      await service.updateSettings('owner-a', {
        deleteFailedRecords: false,
        deleteOrphanFiles: true,
        enabled: false,
        frequency: 'daily',
        monthlyDay: 1,
        retentionDays: 30,
        scheduledTime: '03:00',
        weeklyDay: 0,
      });

      const manualResult = await service.runCleanup('owner-a', {});
      expect(manualResult.deletedFiles).toBe(1);
      const scheduledFile = join(uploadDir, 'scheduled-object');
      await writeFile(scheduledFile, 'scheduled');
      await utimes(scheduledFile, oldDate, oldDate);
      await service.runCleanup('owner-a', {}, 'scheduled');
      await service.runCleanup('owner-a', { objectIds: ['missing'] });

      const reloaded = new MediaCleanupService(
        createDatabase(),
        createHistoryService(),
        baseDir,
      );
      const ownerHistory = await reloaded.getHistory('owner-a');
      expect(ownerHistory.totalItems).toBe(3);
      expect(ownerHistory.items.map((item) => item.source).sort()).toEqual([
        'manual',
        'manual',
        'scheduled',
      ]);
      expect(ownerHistory.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            deletedFiles: 0,
            deletedItems: [],
            status: 'partial',
          }),
        ]),
      );
      expect(ownerHistory.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            deletedFiles: 1,
            deletedItems: [
              {
                fileName: 'manual-object',
                fileSize: 6,
                objectId: 'manual-object',
              },
            ],
            status: 'success',
          }),
        ]),
      );
      expect(
        ownerHistory.items.find((item) => item.source === 'scheduled'),
      ).toEqual(
        expect.objectContaining({
          deletedFiles: 1,
          status: 'success',
        }),
      );
      expect((await reloaded.getHistory('owner-b')).totalItems).toBe(0);
      await expect(access(manualFile)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('includes planned files in dry-run history without deleting them', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'media-cleanup-dry-run-'));
    const uploadDir = join(baseDir, 'data', 'uploads');
    const objectId = 'dry-run-object';
    const filePath = join(uploadDir, objectId);
    const oldDate = new Date('2025-01-01T00:00:00.000Z');
    try {
      await mkdir(uploadDir, { recursive: true });
      await writeFile(filePath, 'planned');
      await utimes(filePath, oldDate, oldDate);
      const service = new MediaCleanupService(
        createDatabase(),
        createHistoryService(),
        baseDir,
      );
      await service.updateSettings('owner-a', {
        deleteFailedRecords: false,
        deleteOrphanFiles: true,
        enabled: false,
        frequency: 'daily',
        monthlyDay: 1,
        retentionDays: 30,
        scheduledTime: '03:00',
        weeklyDay: 0,
      });

      const result = await service.runCleanup('owner-a', { dryRun: true });
      expect(result.deletedFiles).toBe(1);
      expect(await access(filePath)).toBeUndefined();
      const history = await service.getHistory('owner-a');
      expect(history.items[0]).toEqual(
        expect.objectContaining({
          dryRun: true,
          deletedItems: [{ fileName: objectId, fileSize: 7, objectId }],
          status: 'success',
        }),
      );
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});
