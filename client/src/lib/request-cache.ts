interface CachedRequestState<T> {
  generation: number;
  promise: Promise<T> | null;
  resolvedAt: number;
  value: T | null;
}

function createCachedRequestState<T>(): CachedRequestState<T> {
  return {
    generation: 0,
    promise: null,
    resolvedAt: 0,
    value: null,
  };
}

function invalidateCachedRequest<T>(state: CachedRequestState<T>): void {
  state.generation += 1;
  state.promise = null;
  state.resolvedAt = 0;
  state.value = null;
}

function requestWithCache<T>(
  state: CachedRequestState<T>,
  ttlMs: number,
  request: () => Promise<T>,
): Promise<T> {
  const now: number = Date.now();
  if (state.value !== null && now - state.resolvedAt < ttlMs) {
    return Promise.resolve(state.value);
  }
  if (state.promise) return state.promise;

  const generation: number = state.generation;
  const requestPromise: Promise<T> = request()
    .then((value: T): T => {
      if (state.generation === generation) {
        state.value = value;
        state.resolvedAt = Date.now();
      }
      return value;
    })
    .finally((): void => {
      if (state.promise === requestPromise) state.promise = null;
    });
  state.promise = requestPromise;
  return requestPromise;
}

export { createCachedRequestState, invalidateCachedRequest, requestWithCache };
export type { CachedRequestState };
