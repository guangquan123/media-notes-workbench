export interface BackendHealthState {
  consecutiveFailures: number;
  unavailable: boolean;
}

const BACKEND_FAILURE_THRESHOLD = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function nextBackendHealthState(
  current: BackendHealthState,
  probeSucceeded: boolean,
): BackendHealthState {
  if (probeSucceeded) {
    return { consecutiveFailures: 0, unavailable: false };
  }
  const consecutiveFailures: number = current.consecutiveFailures + 1;
  return {
    consecutiveFailures,
    unavailable: consecutiveFailures >= BACKEND_FAILURE_THRESHOLD,
  };
}

export function describeBackendFailure(error: unknown): string {
  if (!isRecord(error)) return String(error || '未知错误');

  const response: Record<string, unknown> | null = isRecord(error.response)
    ? error.response
    : null;
  const responseData: unknown = response?.data;
  const responseMessage: string = isRecord(responseData)
    ? typeof responseData.message === 'string'
      ? responseData.message
      : ''
    : typeof responseData === 'string'
      ? responseData
      : '';
  const status: string =
    typeof response?.status === 'number' ? `HTTP ${response.status}` : '';
  const code: string = typeof error.code === 'string' ? error.code : '';
  const message: string =
    responseMessage || (typeof error.message === 'string' ? error.message : '');
  const parts: string[] = [status, code, message].filter(Boolean);
  return Array.from(new Set(parts)).join(' · ') || '未知错误';
}
