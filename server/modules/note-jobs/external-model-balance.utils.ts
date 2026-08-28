interface ExternalModelBalanceInfo {
  currency: string | null;
  totalBalance: string | null;
}

interface ParsedExternalModelBalance extends ExternalModelBalanceInfo {
  available: boolean;
}

function getExternalModelBalanceEndpoint(baseUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }
  if (
    parsed.hostname !== 'deepseek.com' &&
    !parsed.hostname.endsWith('.deepseek.com')
  ) {
    return null;
  }
  return `${parsed.origin}/user/balance`;
}

function getExternalModelProvider(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl || '未配置';
  }
}

function parseExternalModelBalance(payload: unknown): ParsedExternalModelBalance {
  if (!payload || typeof payload !== 'object') {
    return { available: false, currency: null, totalBalance: null };
  }
  const record: Record<string, unknown> = payload as Record<string, unknown>;
  const infos: unknown = record.balance_infos;
  const first: Record<string, unknown> | undefined = Array.isArray(infos)
    ? (infos[0] as Record<string, unknown> | undefined)
    : undefined;
  return {
    available: record.is_available === true,
    currency: typeof first?.currency === 'string' ? first.currency : null,
    totalBalance:
      typeof first?.total_balance === 'string' ? first.total_balance : null,
  };
}

export {
  getExternalModelBalanceEndpoint,
  getExternalModelProvider,
  parseExternalModelBalance,
};
