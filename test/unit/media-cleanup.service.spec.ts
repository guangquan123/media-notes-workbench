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
import type { RetainedNoteSource } from '../../shared/api.interface';

function mockDatabase(rows: unknown[]): AppDatabase {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockResolvedValue(rows),
    }),
  } as unknown as AppDatabase;
}

describe('media cleanup service', () => {
  it('deletes an eligible media file and removes its retained-source reference', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'media-cleanup-'));
    const objectId = 'object-1';
    const uploadDir = join(baseDir, 'data', 'uploads');
    const filePath = join(uploadDir, objectId);
    const oldDate = new Date('2025-01-01T00:00:00.000Z');
    const source: RetainedNoteSource = {
      mediaItems: [
        {
          fileName: 'recording.mp4',
          fileSize: 5,
          mimeType: 'video/mp4',
          objects: [
            {
              bucketId: 'local-uploads',
              filePath: objectId,
              fileSize: 5,
              id: objectId,
            },
          ],
          partCount: 1,
        },
      ],
      noteStyle: 'meeting',
      sourceType: 'video',
      visualOptions: { mode: 'disabled' },
    };
    const rows = [
      {
        completedAt: oldDate,
        jobId: 'job-1',
        ownerId: 'user-1',
        sourceAssetGroupId: 'group-1',
        sourceSnapshotJson: JSON.stringify(source),
        startedAt: oldDate,
        status: 'completed',
        title: '历史视频笔记',
      },
    ];
    const confirmDeletedSourceObjects = jest.fn().mockResolvedValue({});
    const history = {
      confirmDeletedSourceObjects,
    } as unknown as NoteHistoryService;
    try {
      await mkdir(uploadDir, { recursive: true });
      await writeFile(filePath, 'video');
      await utimes(filePath, oldDate, oldDate);
      const service = new MediaCleanupService(
        mockDatabase(rows),
        history,
        baseDir,
      );
      await service.updateSettings('user-1', {
        deleteFailedRecords: false,
        deleteOrphanFiles: true,
        enabled: false,
        frequency: 'daily',
        monthlyDay: 1,
        retentionDays: 30,
        scheduledTime: '03:00',
        weeklyDay: 0,
      });

      const inventory = await service.getInventory('user-1');
      expect(inventory.files[0]).toEqual(
        expect.objectContaining({
          absolutePath: filePath,
          eligible: true,
          fileName: 'recording.mp4',
          objectId,
        }),
      );

      const result = await service.runCleanup('user-1', {});
      expect(result).toEqual(
        expect.objectContaining({ deletedBytes: 5, deletedFiles: 1 }),
      );
      expect(confirmDeletedSourceObjects).toHaveBeenCalledWith(
        'job-1',
        'user-1',
        [objectId],
      );
      await expect(access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});
