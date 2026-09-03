/// <reference types="vite/client" />

// 本地运行时开关：构建时通过 VITE_RUNTIME=local 启用本地模式（默认妙搭）。
export function isLocalRuntime(): boolean {
  return import.meta.env.VITE_RUNTIME === 'local';
}
