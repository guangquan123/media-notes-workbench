import {
  ExternalModelRequestError,
  fetchExternalModelJson,
} from '../../server/modules/note-jobs/external-model-request.utils';

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

  it('retries a terminated transport request and returns the later successful response', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('terminated'))
      .mockResolvedValueOnce({
        json: async (): Promise<unknown> => ({ ok: true }),
        ok: true,
        status: 200,
      } as Response);

    await expect(
      fetchExternalModelJson(
        'https://model.example.com/v1/chat/completions',
        { method: 'POST' },
        20_000,
        { retryBaseDelayMs: 0 },
      ),
    ).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries retryable HTTP failures and reports the final diagnostic attempt count', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async (): Promise<unknown> => ({}),
      ok: false,
      status: 503,
    } as Response);

    try {
      await fetchExternalModelJson(
        'https://model.example.com/v1/chat/completions',
        { method: 'POST' },
        20_000,
        { retryBaseDelayMs: 0 },
      );
      throw new Error('expected fetchExternalModelJson to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalModelRequestError);
      const requestError = error as ExternalModelRequestError;
      expect(requestError.kind).toBe('http_retryable');
      expect(requestError.status).toBe(503);
      expect(requestError.attempts).toBe(3);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does not retry a client configuration or permission failure', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async (): Promise<unknown> => ({}),
      ok: false,
      status: 401,
    } as Response);

    try {
      await fetchExternalModelJson(
        'https://model.example.com/v1/chat/completions',
        { method: 'POST' },
        20_000,
        { retryBaseDelayMs: 0 },
      );
      throw new Error('expected fetchExternalModelJson to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalModelRequestError);
      const requestError = error as ExternalModelRequestError;
      expect(requestError.kind).toBe('http_client');
      expect(requestError.status).toBe(401);
      expect(requestError.attempts).toBe(1);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry an aborted request or leak the runtime abort message', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(
      Object.assign(new Error('This operation was aborted'), {
        name: 'AbortError',
      }),
    );

    await expect(
      fetchExternalModelJson(
        'https://model.example.com/v1/chat/completions',
        { method: 'POST' },
        20_000,
        { retryBaseDelayMs: 0 },
      ),
    ).rejects.toThrow('外部模型请求被取消或中止');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
