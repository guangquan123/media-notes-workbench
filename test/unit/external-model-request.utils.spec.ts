import { fetchExternalModelJson } from '../../server/modules/note-jobs/external-model-request.utils';

describe('external model request utilities', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns JSON and gives every request an independent abort signal', async () => {
    const signals: AbortSignal[] = [];
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        async (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          if (init?.signal) signals.push(init.signal);
          return {
            json: async (): Promise<unknown> => ({ ok: true }),
            ok: true,
            status: 200,
          } as Response;
        },
      );

    await expect(
      fetchExternalModelJson('https://model.example.com/v1/chat/completions', {
        method: 'POST',
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      fetchExternalModelJson('https://model.example.com/v1/chat/completions', {
        method: 'POST',
      }),
    ).resolves.toEqual({ ok: true });

    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(
      signals.every((signal: AbortSignal): boolean => !signal.aborted),
    ).toBe(true);
  });

  it('reports HTTP failures with the response status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async (): Promise<unknown> => ({}),
      ok: false,
      status: 503,
    } as Response);

    await expect(
      fetchExternalModelJson('https://model.example.com/v1/chat/completions', {
        method: 'POST',
      }),
    ).rejects.toThrow('服务返回 HTTP 503');
  });

  it('normalizes AbortError instead of leaking the runtime abort message', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(
      Object.assign(new Error('This operation was aborted'), {
        name: 'AbortError',
      }),
    );

    await expect(
      fetchExternalModelJson(
        'https://model.example.com/v1/chat/completions',
        { method: 'POST' },
        20_000,
      ),
    ).rejects.toThrow('外部模型请求超时或被中止（单次请求上限 20 秒）');
  });
});
