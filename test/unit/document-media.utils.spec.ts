import {
  assertDocumentImageAcceptance,
  buildDocumentFetchCommand,
  buildDocumentMediaInsertCommand,
  countDocumentImageBlocks,
  parseCreatedLarkDocument,
} from '../../server/modules/note-jobs/document-media.utils';

describe('native Lark document media', () => {
  it('builds native media insertion and full document fetch commands', () => {
    expect(
      buildDocumentMediaInsertCommand({
        anchor: '图 1：视频原始截图（00:15）',
        caption: '视频原始截图 00:15',
        documentId: 'CT3TdzpFioms2fxx3N9cxXwznmh',
        fileName: 'frame.png',
      }),
    ).toEqual([
      'docs',
      '+media-insert',
      '--as',
      'user',
      '--doc',
      'CT3TdzpFioms2fxx3N9cxXwznmh',
      '--file',
      'frame.png',
      '--selection-with-ellipsis',
      '图 1：视频原始截图（00:15）',
      '--caption',
      '视频原始截图 00:15',
      '--align',
      'center',
      '--format',
      'json',
    ]);
    expect(buildDocumentFetchCommand('CT3TdzpFioms2fxx3N9cxXwznmh')).toContain(
      'full',
    );
  });

  it('parses the created document id and verifies real image blocks', () => {
    const created = parseCreatedLarkDocument(
      JSON.stringify({
        ok: true,
        data: {
          document: {
            document_id: 'CT3TdzpFioms2fxx3N9cxXwznmh',
            url: 'https://my.feishu.cn/docx/CT3TdzpFioms2fxx3N9cxXwznmh',
          },
        },
      }),
    );
    const fetched = JSON.stringify({
      ok: true,
      data: {
        document: {
          content:
            '<title>验收</title><img token="img-1"/><p>正文</p><img token="img-2"/>',
        },
      },
    });

    expect(created.documentId).toBe('CT3TdzpFioms2fxx3N9cxXwznmh');
    expect(countDocumentImageBlocks(fetched)).toBe(2);
    expect(() => assertDocumentImageAcceptance(fetched, 2)).not.toThrow();
    expect(() => assertDocumentImageAcceptance(fetched, 3)).toThrow(
      '飞书文档图片块验收失败',
    );
  });

  it('accepts CLI progress output before the final JSON envelope', () => {
    expect(() =>
      assertDocumentImageAcceptance(
        'Inserting: frame.png\nBlock created: blk-1\n{"ok":true,"data":{"document":{"content":"<img id=\\"img-1\\"/>"}}}',
        1,
      ),
    ).not.toThrow();
  });
});
