import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface LocalDocumentResult {
  documentId: string;
  url: string;
}

@Injectable()
export class LocalDocumentService {
  private readonly directory: string;

  constructor(baseDir: string = process.cwd()) {
    this.directory = join(baseDir, 'data', 'local-documents');
  }

  async create(title: string, markdown: string): Promise<LocalDocumentResult> {
    await mkdir(this.directory, { recursive: true });
    const documentId = randomUUID();
    const filePath = join(this.directory, `${documentId}.md`);
    const content = `# ${title}\n\n${markdown.trim()}\n`;
    await writeFile(filePath, content, { encoding: 'utf8', mode: 0o600 });
    return {
      documentId,
      url: `/api/connectors/local/documents/${documentId}`,
    };
  }

  async read(documentId: string): Promise<string> {
    if (!/^[0-9a-f-]{36}$/iu.test(documentId)) {
      throw new NotFoundException('本地文档不存在。');
    }
    try {
      return await readFile(join(this.directory, `${documentId}.md`), 'utf8');
    } catch {
      throw new NotFoundException('本地文档不存在。');
    }
  }
}
