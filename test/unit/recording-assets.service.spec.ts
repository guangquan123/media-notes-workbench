import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { RecordingAssetsService } from '@server/modules/recording-assets/recording-assets.service';
import type { CreateRecordingAssetRequest } from '@shared/api.interface';

const executeFile = promisify(execFile);
const runFfmpegIntegration = process.env.RUN_FFMPEG_INTEGRATION === '1';

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
    const service = new RecordingAssetsService(baseDir, false);
    await service.create('owner-1', createInput('upload-1'));
    const restored = await new RecordingAssetsService(baseDir, false).list('owner-1');
    expect(restored.totalItems).toBe(1);
    expect(restored.items[0].title).toBe('周会录音');
  });

  it('links a conversion job and updates the recording only when the job finishes', async () => {
    const service = new RecordingAssetsService(baseDir, false);
    const input = createInput('upload-1');
    input.capturedAt = '2026-09-04T06:18:00.000Z';
    const created = await service.create('owner-1', input);

    await service.linkJobForMedia('owner-1', 'job-1', [created.item.media]);
    let item = (await service.get('owner-1', created.item.id)).item;
    expect(item.processingStatus).toBe('processing');
    expect(item.linkedJobIds).toEqual(['job-1']);
    expect(item.title).toBe('周会录音');

    expect(
      await service.getLinkedJobTitle('owner-1', 'job-1', '产品周会'),
    ).toBe('2026-09-04 · 产品周会');
    expect((await service.get('owner-1', created.item.id)).item.title).toBe(
      '周会录音',
    );
    await service.updateLinkedJobTitle('owner-1', 'job-1', '产品周会');
    await service.updateLinkedJobStatus('owner-1', 'job-1', 'processed');
    item = (await service.get('owner-1', created.item.id)).item;
    expect(item.title).toBe('2026-09-04 · 产品周会');
    expect(item.processingStatus).toBe('processed');
  });

  it('queues M4A generation before archive while preserving the source file', async () => {
    await writeFile(join(baseDir, 'data', 'uploads', 'upload-1'), 'audio');
    const service = new RecordingAssetsService(baseDir, false);
    const created = await service.create('owner-1', createInput('upload-1'));
    await service.updateSettings('owner-1', { archivePath: join(baseDir, 'archive'), autoArchive: false, checkDiskSpace: true });
    const result = await service.archive('owner-1', created.item.id);
    expect(result.archived).toBe(false);
    expect(result.item.storageStatus).toBe('pending_archive');
    expect(result.item.playableStatus).toBe('pending');
    expect(await readFile(join(baseDir, 'data', 'uploads', 'upload-1'), 'utf8')).toBe('audio');
  });

  it('keeps the recording visible and marks archive failure when the source is missing', async () => {
    const service = new RecordingAssetsService(baseDir, false);
    const created = await service.create('owner-1', createInput('missing'));
    const result = await service.archive('owner-1', created.item.id);
    expect(result.archived).toBe(false);
    expect(result.item.storageStatus).toBe('pending_archive');
    expect((await service.list('owner-1')).totalItems).toBe(1);
  });

  it('queues only owned legacy bin archives for M4A repair', async () => {
    const service = new RecordingAssetsService(baseDir, false);
    const created = await service.create('owner-1', createInput('upload-1'));
    const manifestPath = join(baseDir, '.recording-assets.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      items: Array<{ archivePath?: string; id: string }>;
    };
    manifest.items[0].archivePath = join(baseDir, 'archive', 'legacy.bin');
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');

    const result = await service.repairLegacyArchives('owner-1');
    expect(result).toEqual({ queued: 1, total: 1 });
    expect((await service.get('owner-1', created.item.id)).item.storageStatus).toBe(
      'pending_archive',
    );
  });

  (runFfmpegIntegration ? it : it.skip)(
    'creates a verified M4A and archives it without deleting the WebM source',
    async () => {
      const sourcePath = join(baseDir, 'data', 'uploads', 'upload-1');
      await executeFile('ffmpeg', [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=1000:duration=1',
        '-c:a',
        'libopus',
        '-f',
        'webm',
        '-y',
        sourcePath,
      ]);
      const service = new RecordingAssetsService(baseDir);
      const created = await service.create('owner-1', createInput('upload-1'));
      await service.updateSettings('owner-1', {
        archivePath: join(baseDir, 'archive'),
        autoArchive: false,
        checkDiskSpace: true,
      });

      let item = created.item;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        item = (await service.get('owner-1', created.item.id)).item;
        if (item.playableStatus === 'ready') break;
      }

      expect(item.playableStatus).toBe('ready');
      expect(item.playableFileName).toMatch(/\.m4a$/u);
      const archive = await service.archive('owner-1', created.item.id);
      expect(archive.archived).toBe(true);
      expect(archive.item.archivePath).toMatch(/\.m4a$/u);
      expect((await readFile(sourcePath)).length).toBeGreaterThan(0);
    },
    30_000,
  );

  (runFfmpegIntegration ? it : it.skip)(
    'reuses an already compatible M4A without re-encoding it',
    async () => {
      const sourcePath = join(baseDir, 'data', 'uploads', 'upload-1');
      await executeFile('ffmpeg', [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=800:duration=1',
        '-c:a',
        'aac',
        '-f',
        'ipod',
        '-y',
        sourcePath,
      ]);
      const service = new RecordingAssetsService(baseDir);
      const input = createInput('upload-1');
      input.fileName = 'meeting.m4a';
      input.media.fileName = 'meeting.m4a';
      input.mimeType = 'audio/x-m4a';
      input.media.mimeType = 'audio/x-m4a';
      const created = await service.create('owner-1', input);

      let item = created.item;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        item = (await service.get('owner-1', created.item.id)).item;
        if (item.playableStatus === 'ready') break;
      }

      const playable = await service.getPlayableFile('owner-1', created.item.id);
      expect(item.playableStatus).toBe('ready');
      expect(await readFile(playable.path)).toEqual(await readFile(sourcePath));
    },
    30_000,
  );

  (runFfmpegIntegration ? it : it.skip)(
    'repairs a legacy bin archive after its original upload has been removed',
    async () => {
      const sourcePath = join(baseDir, 'data', 'uploads', 'upload-1');
      const archiveDir = join(baseDir, 'archive');
      const legacyPath = join(archiveDir, 'legacy.bin');
      await mkdir(archiveDir, { recursive: true });
      await executeFile('ffmpeg', [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=500:duration=1',
        '-c:a',
        'libopus',
        '-f',
        'webm',
        '-y',
        sourcePath,
      ]);
      const creator = new RecordingAssetsService(baseDir, false);
      const created = await creator.create('owner-1', createInput('upload-1'));
      await copyFile(sourcePath, legacyPath);
      await rm(sourcePath);
      const manifestPath = join(baseDir, '.recording-assets.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        items: Array<{ archivePath?: string }>;
      };
      manifest.items[0].archivePath = legacyPath;
      await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');

      const worker = new RecordingAssetsService(baseDir);
      expect(await worker.repairLegacyArchives('owner-1')).toEqual({
        queued: 1,
        total: 1,
      });
      let item = created.item;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        item = (await worker.get('owner-1', created.item.id)).item;
        if (item.storageStatus === 'archived') break;
      }

      expect(item.playableStatus).toBe('ready');
      expect(item.archivePath).toMatch(/\.m4a$/u);
      expect(existsSync(legacyPath)).toBe(true);
    },
    30_000,
  );

  it('does not expose another owners recording', async () => {
    const service = new RecordingAssetsService(baseDir, false);
    await service.create('owner-1', createInput('upload-1'));
    expect((await service.list('owner-2')).items).toEqual([]);
  });
});
