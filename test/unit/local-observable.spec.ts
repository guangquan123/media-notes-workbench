import { AppEnv, observable } from '../../client/src/lib/local-observable';

describe('local observable adapter', () => {
  it('preserves platform environment values without starting a transport', () => {
    expect(AppEnv.Dev).toBe('preview');
    expect(AppEnv.Prod).toBe('runtime');
    expect(observable.start()).toBeUndefined();
    expect(observable.startSpan()).toBeUndefined();
  });

  it('executes traced work without reporting it externally', async () => {
    const result = await observable.trace('local-task', async (span) => {
      expect(span).toBeUndefined();
      return 'done';
    });

    expect(result).toBe('done');
  });
});
