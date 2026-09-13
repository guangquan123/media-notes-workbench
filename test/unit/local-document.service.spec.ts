import { NotFoundException } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDocumentService } from '../../server/modules/note-jobs/local-document.service';

describe('local document service', () => {
  let baseDir: string;
  let previousDataDir: string | undefined;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'local-note-'));
    previousDataDir = process.env.WORKBENCH_DATA_DIR;
    process.env.WORKBENCH_DATA_DIR = baseDir;
  });

  afterEach(async () => {
    if (previousDataDir === undefined) delete process.env.WORKBENCH_DATA_DIR;
    else process.env.WORKBENCH_DATA_DIR = previousDataDir;
    await rm(baseDir, { force: true, recursive: true });
  });

  it('writes Markdown under the local data directory and serves it by generated id', async () => {
    const service = new LocalDocumentService();
    const result = await service.create('第一篇笔记', '# 标题\n\n内容', 2);
    const id: string = result.url.split('/').at(-1) || '';

    await expect(service.read(id)).resolves.toEqual({
      content: '# 标题\n\n内容\n',
      fileName: `${id}.md`,
    });
    expect(result.skippedOptional).toHaveLength(2);
    expect(result.publishedCount).toBe(0);
  });

  it('rejects malformed ids and missing documents without resolving paths outside the note directory', async () => {
    const service = new LocalDocumentService();

    await expect(service.read('../secret')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.read('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
