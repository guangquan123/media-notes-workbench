'use client';
import { getDataloom } from '@lark-apaas/client-toolkit/dataloom';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { isLocalRuntime } from '@/lib/runtime';
import { getDefaultBucketId } from '@lark-apaas/client-toolkit/tools/storage';

import { mapWithConcurrency } from '@shared/async.utils';
import type { StoredSourceObject } from '@shared/api.interface';
import {
  createUploadAbortError,
  createMediaUploadPartError,
  MEDIA_UPLOAD_PART_TIMEOUT_MS,
  runWithUploadDeadline,
} from '@/utils/upload-error';
import { calculateUploadedBytes } from '@/utils/upload-progress';

const MEDIA_UPLOAD_PART_SIZE = 32 * 1024 * 1024;
const MEDIA_UPLOAD_MAX_ATTEMPTS = 3;
const MEDIA_UPLOAD_RETRY_DELAY_MS = 1500;
const MEDIA_UPLOAD_CONCURRENCY = 2;

export interface UploadFileData {
  id: string;
  filePath: string;
  bucketId: string;
  fileSize: number;
  url: string;
}

export interface MediaUploadProgress {
  currentPart: number;
  totalParts: number;
  totalBytes: number;
  uploadedBytes: number;
}

export interface StoredSourceDeletionResult {
  deletedObjectIds: string[];
  failures: Array<{ message: string; objectId: string }>;
}

interface MediaUploadOptions {
  signal?: AbortSignal;
}

interface MediaUploadPartContext {
  fileName: string;
  partNumber: number;
  totalParts: number;
}

function throwIfUploadAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createUploadAbortError();
}

function waitForUploadRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    throwIfUploadAborted(signal);
    const handleAbort = (): void => {
      window.clearTimeout(timer);
      reject(createUploadAbortError());
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export function toStoredSourceObject(
  file: UploadFileData,
): StoredSourceObject {
  return {
    bucketId: file.bucketId,
    filePath: file.filePath,
    fileSize: file.fileSize,
    id: file.id,
  };
}

async function uploadFileLocal(file: File): Promise<UploadFileData> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  // eslint-disable-next-line no-restricted-syntax -- local multipart upload uses native fetch
  const response = await fetch("/api/local-uploads", { method: "POST", body: formData });
  if (!response.ok) throw new Error(`本地上传失败 HTTP ${response.status}`);
  const data = (await response.json()) as { id: string; url: string; fileSize: number };
  return { id: data.id, filePath: data.id, bucketId: "local", fileSize: data.fileSize, url: data.url };
}
export async function uploadFile(
  file: File,
  onPartProgress?: (uploadedBytes: number) => void,
  options: MediaUploadOptions = {},
): Promise<UploadFileData> {
  if (isLocalRuntime()) {
    const uploaded = await uploadFileLocal(file);
    onPartProgress?.(file.size);
    return uploaded;
  }
  throwIfUploadAborted(options.signal);
  const dataloom = await runWithUploadDeadline(getDataloom(), options.signal);
  const bucketId: string = getDefaultBucketId();
  const bucket = dataloom.storage.from(bucketId);
  onPartProgress?.(0);
  const result = await runWithUploadDeadline(
    bucket.uploadFile(file, {
      ...(file.type ? { contentType: file.type } : {}),
    }),
    options.signal,
    MEDIA_UPLOAD_PART_TIMEOUT_MS,
  );
  if (result.error) {
    throw result.error;
  }
  if (options.signal?.aborted) {
    await bucket.remove([result.data.file_path]).catch(() => undefined);
    throw createUploadAbortError();
  }
  onPartProgress?.(file.size);
  const signedUrlResult = await runWithUploadDeadline(
    bucket.createSignedUrl(result.data.file_path, 24 * 60 * 60),
    options.signal,
  );
  if (signedUrlResult.error) {
    await bucket.remove([result.data.file_path]);
    throw signedUrlResult.error;
  }
  if (options.signal?.aborted) {
    await bucket.remove([result.data.file_path]).catch(() => undefined);
    throw createUploadAbortError();
  }

  return {
    id: result.data.id,
    filePath: result.data.file_path,
    bucketId: result.data.bucket_id,
    fileSize: file.size,
    url: signedUrlResult.data.signedUrl,
  };
}

export async function uploadMediaFile(
  file: File,
  onProgress?: (progress: MediaUploadProgress) => void,
  options: MediaUploadOptions = {},
): Promise<UploadFileData[]> {
  if (isLocalRuntime()) {
    const uploaded = await uploadFileLocal(file);
    onProgress?.({ currentPart: 1, totalParts: 1, totalBytes: file.size, uploadedBytes: file.size });
    return [uploaded];
  }
  throwIfUploadAborted(options.signal);
  const startedAt: number = performance.now();
  if (file.size <= MEDIA_UPLOAD_PART_SIZE) {
    const upload: UploadFileData = await uploadMediaPart(
      file,
      (uploadedBytes: number) =>
        onProgress?.({
          currentPart: 1,
          totalParts: 1,
          totalBytes: file.size,
          uploadedBytes,
        }),
      options,
      { fileName: file.name, partNumber: 1, totalParts: 1 },
    );
    const uploads: UploadFileData[] = [upload];
    logMediaUploadMetric(file, startedAt, uploads.length);
    return uploads;
  }

  const totalParts: number = Math.ceil(file.size / MEDIA_UPLOAD_PART_SIZE);
  const partProgress: number[] = Array<number>(totalParts).fill(0);
  const completedUploads: UploadFileData[] = [];
  const parts: Array<{ content: Blob; index: number }> = Array.from(
    { length: totalParts },
    (_: unknown, index: number) => ({
      content: file.slice(
        index * MEDIA_UPLOAD_PART_SIZE,
        Math.min((index + 1) * MEDIA_UPLOAD_PART_SIZE, file.size),
      ),
      index,
    }),
  );
  try {
    const uploads: UploadFileData[] = await mapWithConcurrency(
      parts,
      MEDIA_UPLOAD_CONCURRENCY,
      async (partDefinition: {
        content: Blob;
        index: number;
      }): Promise<UploadFileData> => {
        const index: number = partDefinition.index + 1;
        const part: File = new File(
          [partDefinition.content],
          `${file.name}.part-${String(index).padStart(3, '0')}`,
          { type: file.type },
        );
        const upload: UploadFileData = await uploadMediaPart(
          part,
          (currentPartBytes: number) => {
            partProgress[partDefinition.index] = currentPartBytes;
            const uploadedBytes: number = partProgress.reduce(
              (total: number, bytes: number) => total + bytes,
              0,
            );
            onProgress?.({
              currentPart: index,
              totalParts,
              totalBytes: file.size,
              uploadedBytes: calculateUploadedBytes(
                0,
                uploadedBytes,
                file.size,
              ),
            });
          },
          options,
          { fileName: file.name, partNumber: index, totalParts },
        );
        completedUploads.push(upload);
        return upload;
      },
      { signal: options.signal },
    );
    logMediaUploadMetric(file, startedAt, uploads.length);
    return uploads;
  } catch (error) {
    await deleteUploadedFiles(completedUploads).catch(() => undefined);
    throw error;
  }
}

function logMediaUploadMetric(
  file: File,
  startedAt: number,
  partCount: number,
): void {
  const durationMs: number = Math.round(performance.now() - startedAt);
  const throughputMbps: number =
    durationMs > 0
      ? Number(((file.size * 8) / durationMs / 1000).toFixed(2))
      : 0;
  logger.info('媒体上传性能', {
    durationMs,
    fileName: file.name,
    fileSize: file.size,
    partCount,
    throughputMbps,
  });
}

async function uploadMediaPart(
  file: File,
  onPartProgress: ((uploadedBytes: number) => void) | undefined,
  options: MediaUploadOptions,
  context: MediaUploadPartContext,
): Promise<UploadFileData> {
  for (let attempt = 1; attempt <= MEDIA_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      throwIfUploadAborted(options.signal);
      return await uploadFile(file, onPartProgress, options);
    } catch (error) {
      if (options.signal?.aborted) throw createUploadAbortError();
      if (attempt === MEDIA_UPLOAD_MAX_ATTEMPTS) {
        throw createMediaUploadPartError(error, {
          ...context,
          attemptCount: attempt,
        });
      }
      await waitForUploadRetry(
        attempt * MEDIA_UPLOAD_RETRY_DELAY_MS,
        options.signal,
      );
    }
  }
  throw new Error('文件上传重试次数已用尽');
}

export async function deleteUploadedFile(
  file: Pick<UploadFileData, 'bucketId' | 'filePath'>,
): Promise<void> {
  const dataloom = await getDataloom();
  const bucket = dataloom.storage.from(file.bucketId);
  const result = await bucket.remove([file.filePath]);
  if (result.error) {
    throw result.error;
  }
}

export async function deleteUploadedFiles(
  files: readonly Pick<UploadFileData, 'bucketId' | 'filePath'>[],
): Promise<void> {
  await Promise.all(
    files.map(
      (file: Pick<UploadFileData, 'bucketId' | 'filePath'>) =>
        deleteUploadedFile(file),
    ),
  );
}

export async function createSignedUrlsForStoredSourceObjects(
  objects: readonly StoredSourceObject[],
): Promise<Record<string, string>> {
  const signedEntries: Array<readonly [string, string]> =
    await mapWithConcurrency(
      objects,
      MEDIA_UPLOAD_CONCURRENCY,
      async (
        object: StoredSourceObject,
      ): Promise<readonly [string, string]> => {
        const dataloom = await getDataloom();
        const bucket = dataloom.storage.from(object.bucketId);
        const result = await bucket.createSignedUrl(
          object.filePath,
          24 * 60 * 60,
        );
        if (result.error) throw result.error;
        return [object.id, result.data.signedUrl];
      },
    );
  return Object.fromEntries(signedEntries);
}

export async function deleteStoredSourceObjects(
  objects: readonly StoredSourceObject[],
): Promise<StoredSourceDeletionResult> {
  const results: Array<
    | { deleted: true; objectId: string }
    | { deleted: false; message: string; objectId: string }
  > = await mapWithConcurrency(
    objects,
    MEDIA_UPLOAD_CONCURRENCY,
    async (
      object: StoredSourceObject,
    ): Promise<
      | { deleted: true; objectId: string }
      | { deleted: false; message: string; objectId: string }
    > => {
      try {
        await deleteUploadedFile(object);
        return { deleted: true, objectId: object.id };
      } catch (error) {
        return {
          deleted: false,
          message: error instanceof Error ? error.message : '删除失败',
          objectId: object.id,
        };
      }
    },
  );
  return {
    deletedObjectIds: results.flatMap(
      (
        result:
          | { deleted: true; objectId: string }
          | { deleted: false; message: string; objectId: string },
      ): string[] => (result.deleted ? [result.objectId] : []),
    ),
    failures: results.flatMap(
      (
        result:
          | { deleted: true; objectId: string }
          | { deleted: false; message: string; objectId: string },
      ): Array<{ message: string; objectId: string }> =>
        'message' in result
          ? [{ message: result.message, objectId: result.objectId }]
          : [],
    ),
  };
}
