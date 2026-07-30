export const UPLOAD_REQUEST_TIMEOUT_MS = 30_000;
export const MEDIA_UPLOAD_PART_TIMEOUT_MS = 10 * 60 * 1_000;

export interface MediaUploadPartFailureContext {
  attemptCount: number;
  fileName?: string;
  partNumber: number;
  totalParts: number;
}

export class MediaUploadPartError extends Error {
  readonly context: MediaUploadPartFailureContext;
  readonly originalError: unknown;

  constructor(
    originalError: unknown,
    context: MediaUploadPartFailureContext,
  ) {
    super('媒体分片上传失败');
    this.name = 'MediaUploadPartError';
    this.context = context;
    this.originalError = originalError;
  }
}

export function createUploadRequestTimeoutError(): Error {
  const error = new Error('连接存储服务超时，请检查网络后重试');
  error.name = 'UploadTimeoutError';
  return error;
}

export function createUploadAbortError(): Error {
  const error = new Error('上传已取消');
  error.name = 'AbortError';
  return error;
}

export function createMediaUploadPartError(
  originalError: unknown,
  context: MediaUploadPartFailureContext,
): MediaUploadPartError {
  return new MediaUploadPartError(originalError, context);
}

export function runWithUploadDeadline<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
  timeoutMs: number = UPLOAD_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createUploadAbortError());
      return;
    }
    const timer = globalThis.setTimeout(() => {
      cleanup();
      reject(createUploadRequestTimeoutError());
    }, timeoutMs);
    const handleAbort = (): void => {
      cleanup();
      reject(createUploadAbortError());
    };
    const cleanup = (): void => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', handleAbort);
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
    operation.then(
      (result: T) => {
        cleanup();
        resolve(result);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function getUploadFailureMessage(error: unknown): string {
  const partError: MediaUploadPartError | null =
    error instanceof MediaUploadPartError ? error : null;
  const originalError: unknown = partError?.originalError || error;
  const context: MediaUploadPartFailureContext | null = partError?.context || null;
  const contextLabel: string = context ? getMediaPartFailureLabel(context) : '';
  const retryLabel: string = context
    ? `，已自动重试 ${context.attemptCount} 次仍未完成`
    : '';

  if (!(originalError instanceof Error)) {
    return context
      ? `${contextLabel}上传失败${retryLabel}。请稍后重新上传。`
      : '文件上传失败，请检查网络后重试';
  }
  if (originalError.name === 'AbortError') return '上传已取消';
  if (originalError.name === 'UploadTimeoutError') {
    return context
      ? `${contextLabel}上传超过 10 分钟${retryLabel}。请检查网络后重新上传。`
      : originalError.message;
  }
  const statusCode: number | null = getUploadErrorStatusCode(originalError);
  if (statusCode === 401 || statusCode === 403) {
    return context
      ? `${contextLabel}无权访问存储服务${retryLabel}。请刷新页面后重新上传。`
      : '无权访问存储服务，请刷新页面后重试';
  }
  if (statusCode === 413) {
    return context
      ? `${contextLabel}超过存储服务允许的大小${retryLabel}。请压缩视频后重新上传。`
      : '文件超过存储服务允许的大小，请压缩后重试';
  }
  if (statusCode === 429) {
    return context
      ? `${contextLabel}上传请求过于频繁${retryLabel}。请稍后重新上传。`
      : '存储服务请求过于频繁，请稍后重试';
  }
  if (statusCode !== null && statusCode >= 500) {
    return context
      ? `${contextLabel}上传时存储服务暂时不可用${retryLabel}。请稍后重新上传。`
      : '存储服务暂时不可用，请稍后重试';
  }
  if (/fetch|network|socket|enotfound/i.test(originalError.message)) {
    if (context) {
      return `${contextLabel}无法连接存储服务${retryLabel}。请检查网络连接后重新上传。`;
    }
    return '无法连接存储服务，请检查网络后重试';
  }
  return context
    ? `${contextLabel}上传失败${retryLabel}。请稍后重新上传。`
    : originalError.message || '文件上传失败，请检查网络后重试';
}

function getMediaPartFailureLabel(
  context: MediaUploadPartFailureContext,
): string {
  const partLabel: string = `第 ${context.partNumber}/${context.totalParts} 个分片`;
  return context.fileName ? `“${context.fileName}”${partLabel}` : partLabel;
}

function getUploadErrorStatusCode(error: Error): number | null {
  const statusMatch: RegExpMatchArray | null = error.message.match(
    /status code\s+(\d{3})/i,
  );
  if (!statusMatch) return null;
  const statusCode: number = Number(statusMatch[1]);
  return Number.isInteger(statusCode) ? statusCode : null;
}
