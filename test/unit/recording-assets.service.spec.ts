import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RecordingAssetsService } from '@server/modules/recording-assets/recording-assets.service';
import type { CreateRecordingAssetRequest } from '@shared/api.interface';

function createInput(uploadId: string): CreateRecordingAssetRequest {
  return {
    fileName: 'meeting.webm',
    fileSize: 5,
    media: {
      downloadUrl: `http://localhost:3000/api/local-uploads/${uploadId}`,
      fileName: 'meeting.webm',
      fileSize: 5,
      mimeType: 'audio/webm',
      storage: { bucketId: 'local', filePath: uploadId, fileSize: 5, id: uploadId },
    },
    mimeType: 'audio/webm',
    source: 'microphone',
    title: '周会录音',
  };
}

describe('RecordingAssetsService', () => {
  let baseDir: string;
  beforeEach(async () => { baseDir = await mkdtemp(join(tmpdir(), 'recording-assets-')); await mkdir(join(baseDir, 'data', 'uploads'), { recursive: true }); });
  afterEach(async () => { await rm(baseDir, { force: true, recursive: true }); });

  it('persists a created recording so it survives service recreation', async () => {
    const service = new RecordingAssetsService(baseDir);
    await service.create('owner-1', createInput('upload-1'));
    const restored = await new RecordingAssetsService(baseDir).list('owner-1');
    expect(restored.totalItems).toBe(1);
    expect(restored.items[0].title).toBe('周会录音');
  });

  it('copies the source file to the configured archive without deleting the source', async () => {
    await writeFile(join(baseDir, 'data', 'uploads', 'upload-1'), 'audio');
    const service = new RecordingAssetsService(baseDir);
    const created = await service.create('owner-1', createInput('upload-1'));
    await service.updateSettings('owner-1', { archivePath: join(baseDir, 'archive'), autoArchive: false, checkDiskSpace: true });
    const result = await service.archive('owner-1', created.item.id);
    expect(result.archived).toBe(true);
    expect(await readFile(join(baseDir, 'data', 'uploads', 'upload-1'), 'utf8')).toBe('audio');
    expect(await readFile(result.item.archivePath || '', 'utf8')).toBe('audio');
  });

  it('keeps the recording visible and marks archive failure when the source is missing', async () => {
    const service = new RecordingAssetsService(baseDir);
    const created = await service.create('owner-1', createInput('missing'));
    const result = await service.archive('owner-1', created.item.id);
    expect(result.archived).toBe(false);
    expect(result.item.storageStatus).toBe('archive_failed');
    expect((await service.list('owner-1')).totalItems).toBe(1);
  });

  it('does not expose another owners recording', async () => {
    const service = new RecordingAssetsService(baseDir);
    await service.create('owner-1', createInput('upload-1'));
    expect((await service.list('owner-2')).items).toEqual([]);
  });
});
