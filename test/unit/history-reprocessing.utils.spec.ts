import {
  SingleFlightGuard,
  getRequestErrorMessage,
} from '../../client/src/pages/ConversionHistoryPage/history-reprocessing.utils';

describe('history reprocessing submission guard', () => {
  it('rejects a duplicate while source snapshot preparation is still running', () => {
    const guard = new SingleFlightGuard();

    expect(guard.tryAcquire('job-1')).toBe(true);
    expect(guard.tryAcquire('job-1')).toBe(false);
    guard.release('job-1');
    expect(guard.tryAcquire('job-1')).toBe(true);
  });

  it('surfaces the backend message instead of replacing every error', () => {
    expect(
      getRequestErrorMessage(
        {
          response: {
            data: { message: '该源文件已有二次处理任务正在运行' },
          },
        },
        '图片重新处理失败',
      ),
    ).toBe('该源文件已有二次处理任务正在运行');
  });
});
