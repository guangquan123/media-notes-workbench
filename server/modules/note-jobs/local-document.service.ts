import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { getLocalDataDir } from '../../common/utils/local-runtime-paths';

export interface LocalDocumentPublishResult {
  publishedCount: number;
  skippedOptional: Array<{ anchor: string; message: string }>;
  url: string;
}

@Injectable()
export class LocalDocumentService {
  private readonly directory: string = join(getLocalDataDir(), 'notes');

  async create(
    title: string,
    markdown: string,
    mediaCount = 0,
  ): Promise<LocalDocumentPublishResult> {
    const id: string = randomUUID();
    await mkdir(this.directory, { recursive: true });
    const fileName: string = `${id}.md`;
    await writeFile(join(this.directory, fileName), `${markdown.trim()}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    return {
      publishedCount: 0,
      skippedOptional: Array.from({ length: mediaCount }, (_, index: number) => ({
        anchor: `media-${index + 1}`,
        message: '本地 Markdown 输出不嵌入外部媒体，已保留原始引用。',
      })),
      url: `/api/note-jobs/local-documents/${id}`,
    };
  }

  async read(id: string): Promise<{ content: string; fileName: string }> {
    if (!/^[0-9a-f-]{36}$/iu.test(id)) {
      throw new NotFoundException('本地笔记不存在');
    }
    const fileName: string = `${id}.md`;
    try {
      const content: string = await readFile(join(this.directory, fileName), 'utf8');
      return { content, fileName: basename(fileName) };
    } catch {
      throw new NotFoundException('本地笔记不存在');
    }
  }
}
