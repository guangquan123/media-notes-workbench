import { readFile } from 'node:fs/promises';
import { DingTalkDocumentService } from '../../server/modules/connectors/dingtalk-document.service';
import { MAX_DOCUMENT_MARKDOWN_CHUNK_LENGTH } from '../../server/modules/note-jobs/document-media.utils';

type CommandResult = { stdout: string; stderr: string };
type CommandRunner = (
  command: string,
  args: string[],
) => Promise<CommandResult>;

describe('DingTalkDocumentService', () => {
  it('creates a document with the first Markdown chunk and appends later chunks', async () => {
    const service = new DingTalkDocumentService();
    const markdown = '段落内容\n\n'.repeat(
      Math.ceil((MAX_DOCUMENT_MARKDOWN_CHUNK_LENGTH * 2 + 1) / 6),
    );
    const invocations: Array<{ args: string[]; markdown: string }> = [];
    const runner: CommandRunner = async (_command, args) => {
      const contentFile = args[args.indexOf('--content-file') + 1];
      invocations.push({ args, markdown: await readFile(contentFile, 'utf8') });
      if (args[1] === 'create') {
        return {
          stdout: JSON.stringify({
            nodeId: 'node-123',
            docUrl: 'https://alidocs.dingtalk.com/i/nodes/node-123',
          }),
          stderr: '',
        };
      }
      return { stdout: JSON.stringify({ success: true }), stderr: '' };
    };
    (service as unknown as { runCommand: CommandRunner }).runCommand = runner;

    const result = await service.create('长文档', markdown);

    expect(result).toEqual({
      externalId: 'node-123',
      url: 'https://alidocs.dingtalk.com/i/nodes/node-123',
    });
    expect(invocations).toHaveLength(3);
    expect(invocations[0].args).toEqual(
      expect.arrayContaining(['doc', 'create']),
    );
    expect(
      invocations
        .slice(1)
        .every(
          ({ args }) =>
            args.includes('doc') &&
            args.includes('update') &&
            args.includes('--node') &&
            args[args.indexOf('--node') + 1] === 'node-123' &&
            args.includes('--mode') &&
            args[args.indexOf('--mode') + 1] === 'append',
        ),
    ).toBe(true);
    expect(invocations.map(({ markdown: content }) => content).join('')).toBe(
      markdown,
    );
    expect(
      invocations.every(
        ({ markdown: content }) =>
          content.length <= MAX_DOCUMENT_MARKDOWN_CHUNK_LENGTH,
      ),
    ).toBe(true);
  });

  it('reports partial writes when an append command fails', async () => {
    const service = new DingTalkDocumentService();
    const markdown = 'x'.repeat(MAX_DOCUMENT_MARKDOWN_CHUNK_LENGTH + 1);
    let calls = 0;
    const runner: CommandRunner = async () => {
      calls += 1;
      if (calls === 1) {
        return { stdout: JSON.stringify({ nodeId: 'node-456' }), stderr: '' };
      }
      throw new Error('append denied');
    };
    (service as unknown as { runCommand: CommandRunner }).runCommand = runner;

    await expect(service.create('长文档', markdown)).rejects.toThrow(
      '钉钉文档第 2 段追加失败，文档可能已部分写入（nodeId: node-456）：append denied',
    );
  });
});
