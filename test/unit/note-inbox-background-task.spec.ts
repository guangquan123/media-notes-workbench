import { runBackgroundTask } from '../../server/modules/note-inbox/note-inbox.utils';

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
});
