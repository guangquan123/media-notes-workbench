// 本地运行时开关：构建时通过 VITE_RUNTIME=local 启用本地模式（默认妙搭）。
export function isLocalRuntime(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_RUNTIME === 'local';
}
