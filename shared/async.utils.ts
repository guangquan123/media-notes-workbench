export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  options: { signal?: AbortSignal } = {},
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('并发数必须是正整数');
  }
  if (items.length === 0) return [];

  const results: R[] = new Array<R>(items.length);
  let nextIndex: number = 0;
  let firstError: unknown;
  const workerCount: number = Math.min(concurrency, items.length);

  const throwIfAborted = (): void => {
    if (!options.signal?.aborted) return;
    const error = new Error('操作已取消');
    error.name = 'AbortError';
    throw error;
  };

  const worker = async (): Promise<void> => {
    while (firstError === undefined) {
      throwIfAborted();
      const index: number = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        const result: R = await mapper(items[index], index);
        throwIfAborted();
        results[index] = result;
      } catch (error) {
        firstError = error;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (firstError !== undefined) throw firstError;
  return results;
}
