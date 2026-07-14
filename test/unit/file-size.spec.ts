import { formatFileSize } from '../../client/src/utils/file-size';

describe('formatFileSize', () => {
  it('formats uploaded gigabytes with one decimal place', () => {
    expect(formatFileSize(8 * 1024 * 1024 * 1024)).toBe('8.0 GB');
  });

  it('formats uploaded megabytes with one decimal place', () => {
    expect(formatFileSize(128 * 1024 * 1024)).toBe('128.0 MB');
  });
});
