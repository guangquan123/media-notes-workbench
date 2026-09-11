import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const {
  migrateLocalRuntime,
}: {
  migrateLocalRuntime: (options: {
    sourceRoot: string;
    targetPaths: {
      appRoot: string;
      cacheDir: string;
      configDir: string;
      dataDir: string;
      homeDir: string;
      logDir: string;
      stateDir: string;
    };
  }) => {
    conflicts: string[];
    markerPath: string;
    rewrittenFiles: string[];
    status: string;
  };
} = require('../../scripts/migrate-local-runtime.js');

function pathsFor(homeDir: string) {
  return {
    appRoot: resolve(homeDir, 'app'),
    cacheDir: join(homeDir, 'cache'),
    configDir: join(homeDir, 'config'),
    dataDir: join(homeDir, 'data'),
    homeDir,
    logDir: join(homeDir, 'logs'),
    stateDir: join(homeDir, 'runtime'),
  };
}

describe('local runtime migration', () => {
  it('copies persistent data, rewrites recording paths, and leaves the source intact', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'media-notes-migration-'));
    const targetHome = await mkdtemp(join(tmpdir(), 'media-notes-target-'));
    try {
      const uploadPath = join(rootDir, 'data', 'uploads', 'upload-1');
      await mkdir(join(rootDir, 'data', 'uploads'), { recursive: true });
      await writeFile(uploadPath, 'audio', { encoding: 'utf8', flag: 'w' });
      await writeFile(
        join(rootDir, '.recording-assets.json'),
        JSON.stringify({
          items: [{ playablePath: join(rootDir, 'data', 'recording-playable', 'a.m4a') }],
        }),
        'utf8',
      );
      await writeFile(
        join(rootDir, '.recording-storage-settings.json'),
        JSON.stringify({
          archivePath: join(rootDir, 'data', 'recordings'),
          ownerId: 'owner-1',
        }),
        'utf8',
      );

      const result = migrateLocalRuntime({
        sourceRoot: rootDir,
        targetPaths: pathsFor(targetHome),
      });

      expect(result.status).toBe('migrated');
      expect(result.conflicts).toEqual([]);
      expect(await readFile(join(targetHome, 'data', 'uploads', 'upload-1'), 'utf8')).toBe('audio');
      const manifest = JSON.parse(
        await readFile(join(targetHome, 'config', '.recording-assets.json'), 'utf8'),
      ) as { items: Array<{ playablePath: string }> };
      expect(manifest.items[0].playablePath).toBe(
        join(targetHome, 'data', 'recording-playable', 'a.m4a'),
      );
      const settings = JSON.parse(
        await readFile(
          join(targetHome, 'config', '.recording-storage-settings.json'),
          'utf8',
        ),
      ) as { archivePath: string };
      expect(settings.archivePath).toBe(join(targetHome, 'data', 'recordings'));
      await expect(readFile(uploadPath, 'utf8')).resolves.toBe('audio');
      await expect(readFile(result.markerPath, 'utf8')).resolves.toContain('"version": 1');
    } finally {
      await rm(rootDir, { recursive: true, force: true });
      await rm(targetHome, { recursive: true, force: true });
    }
  });

  it('reports conflicts without overwriting an existing target file', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'media-notes-migration-'));
    const targetHome = await mkdtemp(join(tmpdir(), 'media-notes-target-'));
    try {
      await writeFile(join(rootDir, '.runtime-config.json'), '{"mode":"local"}\n', 'utf8');
      await mkdir(join(targetHome, 'config'), { recursive: true });
      await writeFile(
        join(targetHome, 'config', '.runtime-config.json'),
        '{"mode":"local","new":true}\n',
        'utf8',
      );

      const result = migrateLocalRuntime({
        sourceRoot: rootDir,
        targetPaths: pathsFor(targetHome),
      });

      expect(result.status).toBe('conflict');
      expect(result.conflicts.join('\n')).toContain('目标文件已存在');
      await expect(readFile(join(targetHome, 'config', '.runtime-config.json'), 'utf8')).resolves.toContain('"new":true');
    } finally {
      await rm(rootDir, { recursive: true, force: true });
      await rm(targetHome, { recursive: true, force: true });
    }
  });
});
