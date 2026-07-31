export class SingleFlightGuard {
  private readonly keys = new Set<string>();

  tryAcquire(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  release(key: string): void {
    this.keys.delete(key);
  }
}

export function getRequestErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error && typeof error === 'object') {
    const response = (error as { response?: unknown }).response;
    if (response && typeof response === 'object') {
      const data = (response as { data?: unknown }).data;
      if (data && typeof data === 'object') {
        const message = (data as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) {
          return message.trim();
        }
        if (Array.isArray(message)) {
          const joined = message
            .filter((item: unknown): item is string => typeof item === 'string')
            .join('；')
            .trim();
          if (joined) return joined;
        }
      }
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
