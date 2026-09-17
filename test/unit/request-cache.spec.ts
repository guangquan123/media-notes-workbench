import {
  createCachedRequestState,
  invalidateCachedRequest,
  requestWithCache,
} from '../../client/src/lib/request-cache';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise: Promise<T> = new Promise<T>((resolve): void => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value: T): void => resolvePromise?.(value),
  };
}

describe('request cache', () => {
  it('deduplicates concurrent reads and reuses the resolved value', async () => {
    const state = createCachedRequestState<string>();
    const deferred = createDeferred<string>();
    const request = jest.fn((): Promise<string> => deferred.promise);

    const first = requestWithCache(state, 30_000, request);
    const second = requestWithCache(state, 30_000, request);
    deferred.resolve('ready');

    await expect(first).resolves.toBe('ready');
    await expect(second).resolves.toBe('ready');
    await expect(requestWithCache(state, 30_000, request)).resolves.toBe(
      'ready',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('caches false values instead of treating them as misses', async () => {
    const state = createCachedRequestState<boolean>();
    const request = jest.fn(async (): Promise<boolean> => false);

    await expect(requestWithCache(state, 30_000, request)).resolves.toBe(false);
    await expect(requestWithCache(state, 30_000, request)).resolves.toBe(false);

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not let an invalidated in-flight response overwrite fresh state', async () => {
    const state = createCachedRequestState<string>();
    const stale = createDeferred<string>();
    const fresh = createDeferred<string>();

    const staleRequest = requestWithCache(state, 30_000, () => stale.promise);
    invalidateCachedRequest(state);
    const freshRequest = requestWithCache(state, 30_000, () => fresh.promise);

    fresh.resolve('fresh');
    await expect(freshRequest).resolves.toBe('fresh');
    stale.resolve('stale');
    await expect(staleRequest).resolves.toBe('stale');

    const fallback = jest.fn(async (): Promise<string> => 'unexpected');
    await expect(requestWithCache(state, 30_000, fallback)).resolves.toBe(
      'fresh',
    );
    expect(fallback).not.toHaveBeenCalled();
  });
});
