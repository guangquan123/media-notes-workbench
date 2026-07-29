import { mapWithConcurrency } from '../../shared/async.utils';

describe('mapWithConcurrency', () => {
  it('limits concurrent work while preserving input order in results', async () => {
    let activeCount: number = 0;
    let maximumActiveCount: number = 0;

    const result: number[] = await mapWithConcurrency(
      [3, 1, 2],
      2,
      async (value: number) => {
        activeCount += 1;
        maximumActiveCount = Math.max(maximumActiveCount, activeCount);
        await new Promise<void>((resolve: () => void) => {
          setTimeout(resolve, value);
        });
        activeCount -= 1;
        return value * 10;
      },
    );

    expect(result).toEqual([30, 10, 20]);
    expect(maximumActiveCount).toBe(2);
  });

  it('does not start another item after the operation is cancelled', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    let releaseFirstBatch: (() => void) | undefined;
    const firstBatch = new Promise<void>((resolve) => {
      releaseFirstBatch = resolve;
    });

    const resultPromise = mapWithConcurrency(
      [1, 2, 3, 4],
      2,
      async (value: number) => {
        started.push(value);
        await firstBatch;
        return value;
      },
      { signal: controller.signal },
    );

    await Promise.resolve();
    controller.abort();
    releaseFirstBatch?.();

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(started).toEqual([1, 2]);
  });
});
