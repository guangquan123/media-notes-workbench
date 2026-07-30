import {
  createMediaUploadPartError,
  createUploadRequestTimeoutError,
  getUploadFailureMessage,
  runWithUploadDeadline,
} from '../../client/src/utils/upload-error';

describe('upload errors', () => {
  it('turns a stalled storage request into an actionable message', () => {
    const error = createUploadRequestTimeoutError();

    expect(error.name).toBe('UploadTimeoutError');
    expect(getUploadFailureMessage(error)).toBe(
      '连接存储服务超时，请检查网络后重试',
    );
  });

  it('identifies the failed media part after upload retries are exhausted', () => {
    const error = createMediaUploadPartError(
      createUploadRequestTimeoutError(),
      {
        attemptCount: 3,
        fileName: 'course.mov',
        partNumber: 2,
        totalParts: 4,
      },
    );

    expect(getUploadFailureMessage(error)).toBe(
      '“course.mov”第 2/4 个分片上传超过 10 分钟，已自动重试 3 次仍未完成。请检查网络后重新上传。',
    );
  });

  it('distinguishes a storage connection failure from a timeout', () => {
    const error = createMediaUploadPartError(new Error('Failed to fetch'), {
      attemptCount: 3,
      partNumber: 1,
      totalParts: 4,
    });

    expect(getUploadFailureMessage(error)).toBe(
      '第 1/4 个分片无法连接存储服务，已自动重试 3 次仍未完成。请检查网络连接后重新上传。',
    );
  });

  it('explains when the storage service rejects an upload request', () => {
    const error = createMediaUploadPartError(
      new Error('Request failed with status code 503'),
      { attemptCount: 3, partNumber: 4, totalParts: 4 },
    );

    expect(getUploadFailureMessage(error)).toBe(
      '第 4/4 个分片上传时存储服务暂时不可用，已自动重试 3 次仍未完成。请稍后重新上传。',
    );
  });

  it('does not expose opaque network implementation errors to users', () => {
    expect(getUploadFailureMessage(new Error('Failed to fetch'))).toBe(
      '无法连接存储服务，请检查网络后重试',
    );
  });

  it('rejects a storage request that does not settle before the deadline', async () => {
    jest.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const result = runWithUploadDeadline(pending, undefined, 50);

    jest.advanceTimersByTime(49);
    await expect(Promise.race([result, Promise.resolve('pending')])).resolves.toBe(
      'pending',
    );
    jest.advanceTimersByTime(1);

    await expect(result).rejects.toMatchObject({ name: 'UploadTimeoutError' });
    jest.useRealTimers();
  });
});
