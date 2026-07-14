'use client';
import { getDataloom } from '@lark-apaas/client-toolkit/dataloom';
import { getDefaultBucketId } from '@lark-apaas/client-toolkit/tools/storage';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

import { calculateUploadedBytes } from '@/utils/upload-progress';

const MEDIA_UPLOAD_PART_SIZE = 128 * 1024 * 1024;
const MEDIA_UPLOAD_MAX_ATTEMPTS = 3;
const MEDIA_UPLOAD_RETRY_DELAY_MS = 1500;
const MEDIA_UPLOAD_PART_TIMEOUT_MS = 10 * 60 * 1000;

interface StoragePreUploadResponse {
  data: {
    uploadID: string;
    uploadUrl: string;
  };
}

interface StorageUploadCallbackResponse {
  data: {
    bucketID: string;
    filePath: string;
    id: string;
  };
}

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

export async function uploadFile(
  file: File,
  onPartProgress?: (uploadedBytes: number) => void,
): Promise<UploadFileData> {
  const dataloom = await getDataloom();
  const bucketId: string = getDefaultBucketId();
  const bucket = dataloom.storage.from(bucketId);
  onPartProgress?.(0);
  const preUpload = await axiosForBackend.post<StoragePreUploadResponse>(
    `/__runtime__/api/v1/storage/object/${bucketId}/pre_upload`,
    {
      fileName: file.name,
      filePath: '',
      fileSize: String(file.size),
      upsert: false,
      ...(file.type ? { contentType: file.type } : {}),
    },
  );
  const eTag: string = await uploadToStorage(
    preUpload.data.data.uploadUrl,
    file,
    onPartProgress,
  );
  const callback = await axiosForBackend.post<StorageUploadCallbackResponse>(
    '/__runtime__/api/v1/storage/object/callback',
    { eTag, uploadID: preUpload.data.data.uploadID },
  );
  const signedUrlResult = await bucket.createSignedUrl(
    callback.data.data.filePath,
    24 * 60 * 60,
  );
  if (signedUrlResult.error) {
    await bucket.remove([callback.data.data.filePath]);
    throw signedUrlResult.error;
  }

  return {
    id: callback.data.data.id,
    filePath: callback.data.data.filePath,
    bucketId: callback.data.data.bucketID,
    fileSize: file.size,
    url: signedUrlResult.data.signedUrl,
  };
}

export async function uploadMediaFile(
  file: File,
  onProgress?: (progress: MediaUploadProgress) => void,
): Promise<UploadFileData[]> {
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
    );
    return [upload];
  }

  const uploads: UploadFileData[] = [];
  const totalParts: number = Math.ceil(file.size / MEDIA_UPLOAD_PART_SIZE);
  let completedBytes: number = 0;
  try {
    for (
      let offset = 0, index = 1;
      offset < file.size;
      offset += MEDIA_UPLOAD_PART_SIZE, index += 1
    ) {
      const content: Blob = file.slice(
        offset,
        Math.min(offset + MEDIA_UPLOAD_PART_SIZE, file.size),
      );
      const part: File = new File(
        [content],
        `${file.name}.part-${String(index).padStart(3, '0')}`,
        { type: file.type },
      );
      const upload: UploadFileData = await uploadMediaPart(
        part,
        (currentPartBytes: number) =>
          onProgress?.({
            currentPart: index,
            totalParts,
            totalBytes: file.size,
            uploadedBytes: calculateUploadedBytes(
              completedBytes,
              currentPartBytes,
              file.size,
            ),
          }),
      );
      uploads.push(upload);
      completedBytes = calculateUploadedBytes(
        completedBytes,
        part.size,
        file.size,
      );
    }
  } catch (error) {
    await deleteUploadedFiles(uploads).catch(() => undefined);
    throw error;
  }
  return uploads;
}

async function uploadMediaPart(
  file: File,
  onPartProgress?: (uploadedBytes: number) => void,
): Promise<UploadFileData> {
  for (let attempt = 1; attempt <= MEDIA_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await uploadFile(file, onPartProgress);
    } catch (error) {
      if (attempt === MEDIA_UPLOAD_MAX_ATTEMPTS) throw error;
      await new Promise<void>((resolve: () => void) => {
        window.setTimeout(resolve, attempt * MEDIA_UPLOAD_RETRY_DELAY_MS);
      });
    }
  }
  throw new Error('文件上传重试次数已用尽');
}

async function uploadToStorage(
  uploadUrl: string,
  file: File,
  onPartProgress?: (uploadedBytes: number) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl, true);
    request.timeout = MEDIA_UPLOAD_PART_TIMEOUT_MS;
    request.setRequestHeader(
      'content-disposition',
      `attachment; filename="${encodeURIComponent(file.name)}"`,
    );
    if (file.type) request.setRequestHeader('content-type', file.type);
    request.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
      onPartProgress?.(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.getResponseHeader('etag') || '');
        return;
      }
      reject(new Error(`对象存储上传失败（HTTP ${request.status}）`));
    };
    request.onerror = () => reject(new Error('对象存储上传连接失败'));
    request.ontimeout = () => reject(new Error('对象存储上传超时'));
    request.send(file);
  });
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
