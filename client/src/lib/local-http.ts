/* eslint-disable no-restricted-syntax -- local runtime falls back to console logging */
import axios, { type AxiosRequestConfig } from 'axios';

export interface BackendResponse<T = unknown> {
  data: T;
  status: number;
  [key: string]: unknown;
}

// 本地模式：直连同源 /api，无需妙搭网关鉴权。
export function axiosForBackend<T = unknown>(config: AxiosRequestConfig): Promise<BackendResponse<T>> {
  return axios({ withCredentials: true, ...config }) as Promise<BackendResponse<T>>;
}

export const logger = {
  error: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  info: (...args: unknown[]) => console.info(...args),
  log: (...args: unknown[]) => console.log(...args),
};
