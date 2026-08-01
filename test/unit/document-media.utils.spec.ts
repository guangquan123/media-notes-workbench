import {
  assertDocumentImageAcceptance,
  buildDocumentFetchCommand,
  buildDocumentMediaInsertCommand,
  countDocumentImageBlocks,
  detectDocumentImageType,
  publishDocumentMediaAssets,
  parsePlatformStorageUrl,
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

  it('parses app storage object URLs for authenticated downloads', () => {
    expect(
      parsePlatformStorageUrl(
        'https://example.aiforce.run/spark/app/app_179bn4jet6k/runtime/api/v1/storage/object/bucket_aadkizwcnygao_static/plugin%2Fframe-01.png',
      ),
    ).toEqual({
      appId: 'app_179bn4jet6k',
      bucketId: 'bucket_aadkizwcnygao_static',
      filePath: 'plugin/frame-01.png',
    });
    expect(
      parsePlatformStorageUrl('https://cdn.example.com/frame-01.png'),
    ).toBeUndefined();
    expect(
      parsePlatformStorageUrl(
        'https://evil.example.com/app/app_179bn4jet6k/runtime/api/v1/storage/object/bucket_aadkizwcnygao_static/plugin%2Fframe-01.png',
      ),
    ).toBeUndefined();
  });

  it('detects supported image formats from file signatures', () => {
    expect(
      detectDocumentImageType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toEqual({ contentType: 'image/png', extension: 'png' });
    expect(
      detectDocumentImageType(
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      ),
    ).toEqual({ contentType: 'image/jpeg', extension: 'jpg' });
    expect(
      detectDocumentImageType(Buffer.from('<html>sign in required</html>')),
    ).toBeUndefined();
  });

  it('skips optional AI images but keeps required originals strict', async () => {
    const assets = [
      {
        anchor: '原始截图',
        caption: '原始截图',
        source: { kind: 'file' as const, path: '/tmp/original.png' },
      },
      {
        anchor: 'AI 派生图',
        caption: 'AI 派生图',
        optional: true,
        source: {
          kind: 'remote-url' as const,
          url: 'https://example.aiforce.run/derived.png',
        },
      },
    ];
    const result = await publishDocumentMediaAssets(
      assets,
      async (asset): Promise<void> => {
        if (asset.optional) throw new Error('signed download failed');
      },
    );

    expect(result.publishedCount).toBe(1);
    expect(result.skippedOptional).toEqual([
      {
        anchor: 'AI 派生图',
        message: 'signed download failed',
      },
    ]);
    await expect(
      publishDocumentMediaAssets([assets[0]], async (): Promise<void> => {
        throw new Error('original missing');
      }),
    ).rejects.toThrow('original missing');
  });
});
