import { calculateUploadedBytes } from '../../client/src/utils/upload-progress';

describe('calculateUploadedBytes', () => {
  it('adds the current part bytes to completed bytes without exceeding total', () => {
    expect(calculateUploadedBytes(128, 32, 150)).toBe(150);
  });
});
