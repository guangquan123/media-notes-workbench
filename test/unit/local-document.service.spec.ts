import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDocumentService } from '../../server/modules/connectors/local-document.service';

describe('local document service', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'local-doc-'));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('creates and reads a local markdown document without Feishu', async () => {
    const service = new LocalDocumentService(baseDir);
    const created = await service.create('测试笔记', '# 内容\n\n正文');
    expect(created.documentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.url).toContain('/api/connectors/local/documents/');
    const markdown = await service.read(created.documentId);
    expect(markdown).toContain('# 测试笔记');
    expect(markdown).toContain('正文');
  });

  it('rejects a missing local document', async () => {
    const service = new LocalDocumentService(baseDir);
    await expect(service.read('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });
});
