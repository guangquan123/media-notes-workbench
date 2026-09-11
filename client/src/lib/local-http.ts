/* eslint-disable no-restricted-syntax -- local runtime falls back to console logging */
import axios, { type AxiosRequestConfig } from 'axios';

export interface BackendResponse<T = unknown> {
  data: T;
  status: number;
  [key: string]: unknown;
}

interface LocalRuntimeWindow extends Window {
  __BASENAME__?: string;
}

function normalizeBasePath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized && normalized !== '/' ? normalized : undefined;
}

function resolveConfiguredBasePath(): string | undefined {
  const windowBasePath =
    typeof window !== 'undefined'
      ? (window as LocalRuntimeWindow).__BASENAME__
      : undefined;
  return normalizeBasePath(windowBasePath) ??
    normalizeBasePath(process.env.CLIENT_BASE_PATH);
}

export function resolveLocalBackendBasePath(
  pathname: string,
): string | undefined {
  return pathname.match(/^\/app\/app_[^/]+/)?.[0];
}

export function resolveLocalBackendRequestPath(
  pathname: string,
  requestPath: string,
): string {
  const normalizedRequestPath = requestPath.startsWith('/')
    ? requestPath
    : `/${requestPath}`;
  const basePath =
    resolveLocalBackendBasePath(pathname) ?? resolveConfiguredBasePath() ?? '';
  return `${basePath}${normalizedRequestPath}`;
}

// 本地模式：直连同源 API；部署在 /app/app_xxx 下时保留应用前缀。
export function axiosForBackend<T = unknown>(config: AxiosRequestConfig): Promise<BackendResponse<T>> {
  const baseURL =
    resolveLocalBackendBasePath(window.location.pathname) ??
    resolveConfiguredBasePath();
  return axios({
    ...(baseURL ? { baseURL } : {}),
    withCredentials: true,
    ...config,
  }) as Promise<BackendResponse<T>>;
}

export const logger = {
  error: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  info: (...args: unknown[]) => console.info(...args),
  log: (...args: unknown[]) => console.log(...args),
};
