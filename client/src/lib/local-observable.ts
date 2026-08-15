export enum AppEnv {
  Dev = 'preview',
  Prod = 'runtime',
}

type TraceCallback<T> = (span: undefined) => Promise<T>;

// Local runtime intentionally disables the platform observability transport.
export const observable = {
  addCount: () => undefined,
  log: () => undefined,
  shutdown: async () => undefined,
  start: () => undefined,
  startSpan: () => undefined,
  trace: <T>(
    _name: string,
    callback: TraceCallback<T>,
  ): Promise<T> => callback(undefined),
};
