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
  if (/arrears|overdue|recharge|account.*balance|欠费/iu.test(rawMessage)) {
    return '腾讯云账号已欠费，ASR 暂不可用，请充值后重试，或关闭腾讯云 ASR 使用本地转录。';
  }
  if (/credential|secret.?id|secret.?key|unauthorized|access.?denied/iu.test(rawMessage)) {
    return `腾讯云 ${service} 凭证或权限无效，请检查 SecretId、SecretKey 和服务授权。`;
  }
  return `腾讯云 ${service} 调用失败：${rawMessage}`;
}

export { formatTencentAsrError, readTencentErrorMessage };
