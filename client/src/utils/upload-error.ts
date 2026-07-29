export const UPLOAD_REQUEST_TIMEOUT_MS = 30_000;

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

export function runWithUploadDeadline<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createUploadAbortError());
      return;
    }
    const timer = globalThis.setTimeout(() => {
      cleanup();
      reject(createUploadRequestTimeoutError());
    }, UPLOAD_REQUEST_TIMEOUT_MS);
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
  if (!(error instanceof Error)) return '文件上传失败，请检查网络后重试';
  if (error.name === 'UploadTimeoutError') return error.message;
  if (/fetch|network|socket|enotfound|status code 5\d\d/i.test(error.message)) {
    return '无法连接存储服务，请检查网络后重试';
  }
  return error.message || '文件上传失败，请检查网络后重试';
}
