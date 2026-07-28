import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  syncMemoryProfile,
  type MemorySyncResult,
} from '../../server/common/utils/memory-profile-sync';

describe('syncMemoryProfile', () => {
  it('mirrors memory files, excludes git metadata, and updates the profile', async () => {
    const temporaryRoot: string = await mkdtemp(
      join(tmpdir(), 'memory-profile-sync-'),
    );
    const sourceRoot: string = join(temporaryRoot, 'memories');
    const targetRoot: string = join(temporaryRoot, 'profile', 'memory-mirror');
    const profilePath: string = join(temporaryRoot, 'profile', 'portrait.md');

    await mkdir(join(sourceRoot, 'extensions', 'ad_hoc', 'notes'), {
      recursive: true,
    });
    await mkdir(join(sourceRoot, 'rollout_summaries'), { recursive: true });
    await mkdir(join(sourceRoot, '.git'), { recursive: true });
    await writeFile(
      join(sourceRoot, 'memory_summary.md'),
      '# Current memory\n',
      'utf8',
    );
    await writeFile(join(sourceRoot, 'MEMORY.md'), '# Registry\n', 'utf8');
    await writeFile(
      join(sourceRoot, 'raw_memories.md'),
      '# Raw memories\n',
      'utf8',
    );
    await writeFile(
      join(sourceRoot, 'extensions', 'ad_hoc', 'notes', 'preference.md'),
      '# Preference\n',
      'utf8',
    );
    await writeFile(
      join(sourceRoot, 'rollout_summaries', 'task.md'),
      '# Task summary\n',
      'utf8',
    );
    await writeFile(join(sourceRoot, '.git', 'config'), 'private\n', 'utf8');
    await mkdir(join(temporaryRoot, 'profile'), { recursive: true });
    await writeFile(profilePath, '# User portrait\n', 'utf8');

    const result: MemorySyncResult = await syncMemoryProfile({
      now: new Date('2026-07-28T13:45:00.000Z'),
      profilePath,
      sourceRoot,
      targetRoot,
    });

    expect(result.status).toBe('updated');
    expect(result.sourceFileCount).toBe(5);
    expect(
      await readFile(join(targetRoot, 'source', 'memory_summary.md'), 'utf8'),
    ).toBe('# Current memory\n');
    await expect(
      readFile(join(targetRoot, 'source', '.git', 'config'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    const manifestText: string = await readFile(
      join(targetRoot, 'sync-manifest.json'),
      'utf8',
    );
    const manifest: {
      files: Array<{ path: string; sha256: string }>;
      sourceDigest: string;
    } = JSON.parse(manifestText);
    expect(manifest.files).toHaveLength(5);
    expect(manifest.sourceDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      manifest.files.find(
        (file: { path: string }) => file.path === 'memory_summary.md',
      )?.sha256,
    ).toMatch(/^[a-f0-9]{64}$/u);

    const readme: string = await readFile(
      join(targetRoot, 'README.md'),
      'utf8',
    );
    expect(readme).toContain('私人长期记忆镜像');
    expect(readme).toContain('不要公开发布');
    expect(readme).toContain('显式偏好：1');
    expect(readme).toContain('历史任务摘要：1');

    const profile: string = await readFile(profilePath, 'utf8');
    expect(profile).toContain('<!-- BEGIN CODEX MEMORY SYNC -->');
    expect(profile).toContain('源文件：5');
    expect(profile).toContain('显式偏好：1');
    expect(profile).toContain('历史任务摘要：1');
    expect(profile).toContain('<!-- END CODEX MEMORY SYNC -->');
  });

  it('does not rewrite the mirror or profile when the source is unchanged', async () => {
    const temporaryRoot: string = await mkdtemp(
      join(tmpdir(), 'memory-profile-sync-idempotent-'),
    );
    const sourceRoot: string = join(temporaryRoot, 'memories');
    const targetRoot: string = join(temporaryRoot, 'profile', 'memory-mirror');
    const profilePath: string = join(temporaryRoot, 'profile', 'portrait.md');

    await mkdir(sourceRoot, { recursive: true });
    await mkdir(join(temporaryRoot, 'profile'), { recursive: true });
    await writeFile(
      join(sourceRoot, 'memory_summary.md'),
      '# Current memory\n',
      'utf8',
    );
    await writeFile(profilePath, '# User portrait\n', 'utf8');

    const firstResult: MemorySyncResult = await syncMemoryProfile({
      now: new Date('2026-07-28T13:45:00.000Z'),
      profilePath,
      sourceRoot,
      targetRoot,
    });
    const firstReadme: string = await readFile(
      join(targetRoot, 'README.md'),
      'utf8',
    );
    const firstProfile: string = await readFile(profilePath, 'utf8');

    const secondResult: MemorySyncResult = await syncMemoryProfile({
      now: new Date('2026-07-29T13:45:00.000Z'),
      profilePath,
      sourceRoot,
      targetRoot,
    });

    expect(firstResult.status).toBe('updated');
    expect(secondResult.status).toBe('unchanged');
    expect(await readFile(join(targetRoot, 'README.md'), 'utf8')).toBe(
      firstReadme,
    );
    expect(await readFile(profilePath, 'utf8')).toBe(firstProfile);
  });
});
