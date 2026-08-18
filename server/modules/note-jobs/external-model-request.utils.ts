const DEFAULT_EXTERNAL_MODEL_REQUEST_TIMEOUT_MS = 15 * 60 * 1_000;

export const EXTERNAL_MODEL_REQUEST_TIMEOUT_MS =
  DEFAULT_EXTERNAL_MODEL_REQUEST_TIMEOUT_MS;

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

export async function fetchExternalModelJson(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number = EXTERNAL_MODEL_REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const controller: AbortController = new AbortController();
  const timeout: NodeJS.Timeout = setTimeout(
    (): void => controller.abort(),
    timeoutMs,
  );
  try {
    const response: Response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`服务返回 HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted || isAbortLikeError(error)) {
      throw new Error(
        `外部模型请求超时或被中止（单次请求上限 ${formatTimeout(timeoutMs)}）`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
