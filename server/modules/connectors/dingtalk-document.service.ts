import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCliInvocation } from '../../common/utils/cli-command';
import {
  splitMarkdownForDocument,
  MAX_DOCUMENT_MARKDOWN_CHUNK_LENGTH,
} from '../note-jobs/document-media.utils';

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface DingTalkDocumentResult {
  externalId: string;
  url: string;
}

interface DingTalkCreateResponse {
  nodeId?: string;
  docUrl?: string;
}

interface DingTalkReadResponse {
  markdown?: string;
  title?: string;
}

@Injectable()
export class DingTalkDocumentService {
  private readonly logger = new Logger(DingTalkDocumentService.name);

  async create(
    title: string,
    markdown: string,
  ): Promise<DingTalkDocumentResult> {
    const workDir = await mkdtemp(join(tmpdir(), 'dingtalk-doc-'));
    try {
      const [initialMarkdown, ...remainingMarkdown] =
        splitMarkdownForDocument(markdown);
      const initialContentFile = join(workDir, 'content-1.md');
      await writeFile(initialContentFile, initialMarkdown, {
        encoding: 'utf8',
      });
      const result = await this.runCommand(this.cli(), [
        'doc',
        'create',
        '--name',
        title.slice(0, 120),
        '--content-file',
        initialContentFile,
        '--format',
        'json',
      ]);
      const parsed = this.parseJson<DingTalkCreateResponse>(result.stdout);
      const nodeId = parsed.nodeId;
      if (!nodeId)
        throw new Error(result.stderr.trim() || '钉钉文档创建未返回 nodeId');

      for (const [index, chunk] of remainingMarkdown.entries()) {
        const chunkNumber = index + 2;
        const contentFile = join(workDir, `content-${chunkNumber}.md`);
        await writeFile(contentFile, chunk, { encoding: 'utf8' });
        try {
          await this.runCommand(this.cli(), [
            'doc',
            'update',
            '--node',
            nodeId,
            '--content-file',
            contentFile,
            '--mode',
            'append',
            '--format',
            'json',
          ]);
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误';
          throw new Error(
            `钉钉文档第 ${chunkNumber} 段追加失败，文档可能已部分写入（nodeId: ${nodeId}）：${message}`,
          );
        }
      }
      if (remainingMarkdown.length > 0) {
        this.logger.log(
          `钉钉 Markdown 已分 ${remainingMarkdown.length + 1} 段写入，单段不超过 ${MAX_DOCUMENT_MARKDOWN_CHUNK_LENGTH} 字符。`,
        );
      }
      return {
        externalId: nodeId,
        url: parsed.docUrl || `https://alidocs.dingtalk.com/i/nodes/${nodeId}`,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  async read(
    urlOrNodeId: string,
  ): Promise<{ markdown: string; title?: string }> {
    const result = await this.runCommand(this.cli(), [
      'doc',
      'read',
      '--node',
      urlOrNodeId,
      '--format',
      'json',
    ]);
    const parsed = this.parseJson<DingTalkReadResponse>(result.stdout);
    const markdown = parsed.markdown?.trim();
    if (!markdown)
      throw new Error(result.stderr.trim() || '钉钉文档读取未返回 markdown');
    return { markdown, title: parsed.title };
  }

  private cli(): string {
    return process.platform === 'win32' ? 'dws.cmd' : 'dws';
  }

  private parseJson<T>(stdout: string): T {
    try {
      return JSON.parse(stdout) as T;
    } catch {
      return {} as T;
    }
  }

  private runCommand(command: string, args: string[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const invocation = resolveCliInvocation(command, args);
      const child = spawn(invocation.command, invocation.args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on(
        'data',
        (chunk: Buffer) => (stdout += chunk.toString('utf8')),
      );
      child.stderr.on(
        'data',
        (chunk: Buffer) => (stderr += chunk.toString('utf8')),
      );
      child.on('error', reject);
      child.on('close', (code: number | null) =>
        code === 0
          ? resolve({ stdout, stderr })
          : reject(
              new Error(
                stderr.trim() || stdout.trim() || `${command} 执行失败`,
              ),
            ),
      );
    });
  }
}
