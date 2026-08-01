import { Inject, Injectable } from '@nestjs/common';
import type { DownloadResult } from '@lark-apaas/file-service';
import { validateMediaDownloadUrl } from './note-jobs.utils';
import {
  detectDocumentImageType,
  MAX_DOCUMENT_IMAGE_BYTES,
  parsePlatformStorageUrl,
  type DocumentImageType,
} from './document-media.utils';

export interface DownloadedDocumentImage {
  buffer: Buffer;
  contentType: DocumentImageType['contentType'];
}

export const DOCUMENT_STORAGE_CLIENT = Symbol('DOCUMENT_STORAGE_CLIENT');

export interface DocumentStorageClient {
  download(input: {
    appId: string;
    bucketId: string;
    filePath: string;
  }): PromiseLike<DownloadResult<Blob>>;
}

@Injectable()
export class DocumentImageDownloadService {
  constructor(
    @Inject(DOCUMENT_STORAGE_CLIENT)
    private readonly storageClient: DocumentStorageClient,
  ) {}

  async download(rawUrl: string): Promise<DownloadedDocumentImage> {
    const platformObject = parsePlatformStorageUrl(rawUrl);
    if (platformObject) {
      const result = await this.storageClient.download(platformObject);
      const declaredSize = Number(
        result.metadata?.metadata.contentLength || result.content.size || 0,
      );
      this.assertDeclaredSize(declaredSize);
      return this.validateBytes(
        Buffer.from(await result.content.arrayBuffer()),
      );
    }
    return this.downloadPublicImage(rawUrl);
  }

  private async downloadPublicImage(
    rawUrl: string,
  ): Promise<DownloadedDocumentImage> {
    let currentUrl = validateMediaDownloadUrl(rawUrl);
    let response: Response | undefined;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location || redirectCount === 5) {
        throw new Error('图片下载重定向地址无效');
      }
      currentUrl = validateMediaDownloadUrl(
        new URL(location, currentUrl).toString(),
      );
    }
    if (!response?.ok) {
      throw new Error(`图片下载失败（HTTP ${response?.status || 0}）`);
    }
    this.assertDeclaredSize(
      Number(response.headers.get('content-length') || 0),
    );
    return this.validateBytes(Buffer.from(await response.arrayBuffer()));
  }

  private assertDeclaredSize(size: number): void {
    if (Number.isFinite(size) && size > MAX_DOCUMENT_IMAGE_BYTES) {
      throw new Error('图片超过 20 MB');
    }
  }

  private validateBytes(buffer: Buffer): DownloadedDocumentImage {
    if (buffer.length === 0 || buffer.length > MAX_DOCUMENT_IMAGE_BYTES) {
      throw new Error('图片为空或超过 20 MB');
    }
    const imageType = detectDocumentImageType(buffer);
    if (!imageType) throw new Error('下载内容不是受支持的图片');
    return { buffer, contentType: imageType.contentType };
  }
}
