function readTencentErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const record: Record<string, unknown> = error as Record<string, unknown>;
    for (const key of ['message', 'ErrorMsg', 'errorMessage']) {
      if (typeof record[key] === 'string' && record[key].trim()) {
        return record[key].trim();
      }
    }
  }
  return '未知错误';
}

function formatTencentAsrError(
  error: unknown,
  service: 'ASR' | 'COS' = 'ASR',
): string {
  const rawMessage: string = readTencentErrorMessage(error);
  if (isTencentFinancePermissionError(error)) {
    return '查询腾讯云账户余额需要 CAM 权限 finance:trade；请给当前 SecretId 绑定包含该只读权限的策略后重试。';
  }
  if (isTencentAsrQuotaError(error)) {
    return '腾讯云 ASR 额度已耗尽或账号欠费，请充值/购买资源包后重试，或关闭腾讯云 ASR 使用本地转录。';
  }
  if (/credential|secret.?id|secret.?key|unauthorized|access.?denied/iu.test(rawMessage)) {
    return `腾讯云 ${service} 凭证或权限无效，请检查 SecretId、SecretKey 和服务授权。`;
  }
  return `腾讯云 ${service} 调用失败：${rawMessage}`;
}

function isTencentFinancePermissionError(error: unknown): boolean {
  const rawMessage: string = readTencentErrorMessage(error);
  const code: string = getTencentErrorCode(error);
  return /finance:trade|finance[./_-]?trade/iu.test(`${code} ${rawMessage}`);
}

function isTencentAsrQuotaError(error: unknown): boolean {
  const rawMessage: string = readTencentErrorMessage(error);
  const code: string = getTencentErrorCode(error);
  return /UserHasNoAmount|UserHasNoFreeAmount|ServiceIsolate|ResourceInsufficient/iu.test(
    `${code} ${rawMessage}`,
  ) || /arrears|overdue|recharge|account.*balance|欠费/iu.test(rawMessage);
}

function getTencentErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
}

export {
  formatTencentAsrError,
  isTencentAsrQuotaError,
  isTencentFinancePermissionError,
  readTencentErrorMessage,
};
