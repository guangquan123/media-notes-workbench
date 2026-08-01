import {
  DocumentImageDownloadService,
  type DocumentStorageClient,
} from '../../server/modules/note-jobs/document-image-download.service';

describe('DocumentImageDownloadService', () => {
  it('uses authenticated platform storage download for internal object URLs', async () => {
    const download = jest.fn().mockResolvedValue({
      content: new Blob([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ]),
      metadata: {
        metadata: {
          contentLength: '8',
          mimeType: 'application/octet-stream',
        },
      },
    });
    const storageClient = { download } as unknown as DocumentStorageClient;
    const service = new DocumentImageDownloadService(storageClient);

    const result = await service.download(
      'https://example.aiforce.run/spark/app/app_179bn4jet6k/runtime/api/v1/storage/object/bucket_aadkizwcnygao_static/plugin%2Fframe-01.png',
    );

    expect(download).toHaveBeenCalledWith({
      appId: 'app_179bn4jet6k',
      bucketId: 'bucket_aadkizwcnygao_static',
      filePath: 'plugin/frame-01.png',
    });
    expect(result.contentType).toBe('image/png');
    expect(result.buffer).toHaveLength(8);
  });

  it('rejects authenticated responses that are not image bytes', async () => {
    const storageClient = {
      download: jest.fn().mockResolvedValue({
        content: new Blob([Buffer.from('<html>permission denied</html>')]),
        metadata: {
          metadata: {
            contentLength: '30',
            mimeType: 'text/html',
          },
        },
      }),
    } as unknown as DocumentStorageClient;
    const service = new DocumentImageDownloadService(storageClient);

    await expect(
      service.download(
        'https://example.aiforce.run/app/app_179bn4jet6k/runtime/api/v1/storage/object/bucket_aadkizwcnygao_static/plugin%2Fframe-01.png',
      ),
    ).rejects.toThrow('下载内容不是受支持的图片');
  });
});
