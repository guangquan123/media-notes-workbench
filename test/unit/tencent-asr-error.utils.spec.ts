import {
  formatTencentAsrError,
  isTencentFinancePermissionError,
} from '../../server/modules/note-jobs/tencent-asr-error.utils';

describe('Tencent ASR error classification', () => {
  it('explains the finance permission needed for account balance lookup', () => {
    const error = {
      code: 'UnauthorizedOperation',
      message: 'finance:trade resource (*) has no permission',
    };

    expect(isTencentFinancePermissionError(error)).toBe(true);
    expect(formatTencentAsrError(error)).toContain('finance:trade');
  });
});
