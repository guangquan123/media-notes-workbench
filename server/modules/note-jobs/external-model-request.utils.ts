const DEFAULT_EXTERNAL_MODEL_REQUEST_TIMEOUT_MS = 15 * 60 * 1_000;
const DEFAULT_EXTERNAL_MODEL_REQUEST_MAX_ATTEMPTS = 3;
const DEFAULT_EXTERNAL_MODEL_RETRY_BASE_DELAY_MS = 500;

export const EXTERNAL_MODEL_REQUEST_TIMEOUT_MS =
  DEFAULT_EXTERNAL_MODEL_REQUEST_TIMEOUT_MS;

export type ExternalModelRequestFailureKind =
  | 'aborted'
  | 'http_client'
  | 'http_retryable'
  | 'timeout'
  | 'transport'
  | 'unknown';

export interface ExternalModelRequestOptions {
  maxAttempts?: number;
  retryBaseDelayMs?: number;
}

export class ExternalModelRequestError extends Error {
  attempts = 1;

  constructor(
    message: string,
    readonly kind: ExternalModelRequestFailureKind,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ExternalModelRequestError';
  }
}

export function isExternalModelRequestError(
  error: unknown,
): error is ExternalModelRequestError {
  return error instanceof ExternalModelRequestError;
}

function formatTimeout(timeoutMs: number): string {
  if (timeoutMs % 60_000 === 0) return `${timeoutMs / 60_000} 分钟`;
  if (timeoutMs % 1_000 === 0) return `${timeoutMs / 1_000} 秒`;
  return `${timeoutMs} 毫秒`;
}

function isAbortLikeError(error: unknown): boolean {
  const name: string = error instanceof Error ? error.name : '';
  const message: string =
    error instanceof Error ? error.message : String(error);
  return (
    name === 'AbortError' ||
    /\b(?:operation was aborted|aborterror|aborted)\b/i.test(message)
  );
}

function getErrorDiagnostic(error: unknown): string {
  if (error instanceof Error) {
    const cause: unknown = (error as Error & { cause?: unknown }).cause;
    const code: unknown = (error as Error & { code?: unknown }).code;
    return [
      error.name,
      error.message,
      typeof code === 'string' ? code : '',
      getErrorCauseDiagnostic(cause),
    ]
      .filter(Boolean)
      .join(' ');
  }
  return String(error);
}

function getErrorCauseDiagnostic(cause: unknown): string {
  if (!(cause instanceof Error)) return '';
  const code: unknown = (cause as Error & { code?: unknown }).code;
  return [cause.name, cause.message, typeof code === 'string' ? code : '']
    .filter(Boolean)
    .join(' ');
}

function isTransientTransportError(error: unknown): boolean {
  return /\b(?:terminated|econnreset|econnrefused|ehostunreach|enetunreach|etimedout|epipe|und_err_socket|und_err_connect_timeout|socket hang up|network error|fetch failed)\b/i.test(
    getErrorDiagnostic(error),
  );
}

function getRetryAfterMs(response: Response): number | undefined {
  const retryAfter: string | null | undefined =
    response.headers?.get?.('retry-after');
  if (!retryAfter) return undefined;
  const seconds: number = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.round(seconds * 1_000);
  const retryAt: number = Date.parse(retryAfter);
  return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now());
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableFailure(error: ExternalModelRequestError): boolean {
  return error.kind === 'http_retryable' || error.kind === 'transport';
}

function getRetryDelayMs(
  error: ExternalModelRequestError,
  attempt: number,
  retryBaseDelayMs: number,
): number {
  if (error.retryAfterMs !== undefined) return error.retryAfterMs;
  return retryBaseDelayMs * 2 ** (attempt - 1);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise(
    (resolve: () => void): NodeJS.Timeout => setTimeout(resolve, delayMs),
  );
}

async function fetchExternalModelJsonOnce(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller: AbortController = new AbortController();
  let timedOut = false;
  let externallyAborted = false;
  const onExternalAbort = (): void => {
    externallyAborted = true;
    controller.abort();
  };
  if (init.signal?.aborted) onExternalAbort();
  else init.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timeout: NodeJS.Timeout = setTimeout((): void => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response: Response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ExternalModelRequestError(
        `服务返回 HTTP ${response.status}`,
        isRetryableHttpStatus(response.status)
          ? 'http_retryable'
          : 'http_client',
        response.status,
        getRetryAfterMs(response),
      );
    }
    return await response.json();
  } catch (error) {
    if (isExternalModelRequestError(error)) throw error;
    if (timedOut) {
      throw new ExternalModelRequestError(
        `外部模型请求超时（单次请求总时限 ${formatTimeout(timeoutMs)}）`,
        'timeout',
      );
    }
    if (externallyAborted || isAbortLikeError(error)) {
      throw new ExternalModelRequestError(
        '外部模型请求被取消或中止',
        'aborted',
      );
    }
    if (isTransientTransportError(error)) {
      throw new ExternalModelRequestError(
        error instanceof Error ? error.message : String(error),
        'transport',
      );
    }
    throw new ExternalModelRequestError(
      error instanceof Error ? error.message : String(error),
      'unknown',
    );
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function fetchExternalModelJson(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number = EXTERNAL_MODEL_REQUEST_TIMEOUT_MS,
  options: ExternalModelRequestOptions = {},
): Promise<unknown> {
  const maxAttempts: number = Math.max(
    1,
    Math.floor(
      options.maxAttempts ?? DEFAULT_EXTERNAL_MODEL_REQUEST_MAX_ATTEMPTS,
    ),
  );
  const retryBaseDelayMs: number = Math.max(
    0,
    options.retryBaseDelayMs ?? DEFAULT_EXTERNAL_MODEL_RETRY_BASE_DELAY_MS,
  );
  const startedAt: number = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remainingMs: number = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      const timeoutError = new ExternalModelRequestError(
        `外部模型请求超时（单次请求总时限 ${formatTimeout(timeoutMs)}）`,
        'timeout',
      );
      timeoutError.attempts = attempt - 1;
      throw timeoutError;
    }

    try {
      return await fetchExternalModelJsonOnce(input, init, remainingMs);
    } catch (error) {
      if (!isExternalModelRequestError(error)) throw error;
      error.attempts = attempt;
      if (!isRetryableFailure(error) || attempt === maxAttempts) throw error;

      const remainingAfterFailureMs: number =
        timeoutMs - (Date.now() - startedAt);
      const retryDelayMs: number = Math.min(
        getRetryDelayMs(error, attempt, retryBaseDelayMs),
        Math.max(0, remainingAfterFailureMs),
      );
      if (retryDelayMs > 0) await sleep(retryDelayMs);
    }
  }

  throw new ExternalModelRequestError('外部模型请求未能完成', 'unknown');
}
