import { runBackgroundTask } from '../../server/common/utils/background-task';

describe('runBackgroundTask', () => {
  it('reports a rejected background task instead of leaving it unhandled', async () => {
    const connectionError: Error = new Error('CONNECT_TIMEOUT');
    const reportError: jest.Mock<void, [unknown]> = jest.fn();

    runBackgroundTask(
      async (): Promise<void> => Promise.reject(connectionError),
      reportError,
    );
    await new Promise<void>((resolve: () => void) => {
      setImmediate(resolve);
    });

    expect(reportError).toHaveBeenCalledWith(connectionError);
  });

  it('reports a synchronous task failure through the same boundary', async () => {
    const spawnError: Error = new Error('spawn EPERM');
    const reportError: jest.Mock<void, [unknown]> = jest.fn();

    runBackgroundTask((): Promise<void> => {
      throw spawnError;
    }, reportError);
    await new Promise<void>((resolve: () => void) => {
      setImmediate(resolve);
    });

    expect(reportError).toHaveBeenCalledWith(spawnError);
  });
});
