import {
  createUploadRequestTimeoutError,
  getUploadFailureMessage,
  runWithUploadDeadline,
  UPLOAD_REQUEST_TIMEOUT_MS,
} from '../../client/src/utils/upload-error';

describe('upload errors', () => {
  it('turns a stalled storage request into an actionable message', () => {
    const error = createUploadRequestTimeoutError();

    expect(error.name).toBe('UploadTimeoutError');
    expect(getUploadFailureMessage(error)).toBe(
      '连接存储服务超时，请检查网络后重试',
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
    const result = runWithUploadDeadline(pending);

    jest.advanceTimersByTime(UPLOAD_REQUEST_TIMEOUT_MS);

    await expect(result).rejects.toMatchObject({ name: 'UploadTimeoutError' });
    jest.useRealTimers();
  });
});
