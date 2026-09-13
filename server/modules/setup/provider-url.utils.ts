import { BadRequestException } from '@nestjs/common';
import type {
  ProviderUrlAnalysis,
} from '@shared/api.interface';

const UNSAFE_PATH_SUFFIXES: readonly string[] = [
  '/chat/completions',
  '/responses',
  '/models',
];

export function analyzeProviderUrl(value: string): ProviderUrlAnalysis {
  const input: string = value.trim();
  if (!input) {
    return {
      changed: false,
      message: 'API 地址不能为空。',
      requiresConfirmation: false,
      valid: false,
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return {
      changed: false,
      message: 'API 地址必须是完整的 HTTP(S) 地址。',
      requiresConfirmation: false,
      valid: false,
    };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      changed: false,
      message: 'API 地址只支持 HTTP 或 HTTPS。',
      requiresConfirmation: false,
      valid: false,
    };
  }
  if (parsed.username || parsed.password) {
    return {
      changed: false,
      message: 'API 地址不能包含用户名或密码。',
      requiresConfirmation: false,
      valid: false,
    };
  }
  const lowerPath: string = parsed.pathname.toLowerCase().replace(/\/+$/u, '');
  const suffix: string | undefined = UNSAFE_PATH_SUFFIXES.find(
    (candidate: string): boolean => lowerPath.endsWith(candidate),
  );
  if (suffix) {
    const nextPath: string = lowerPath.slice(0, -suffix.length) || '/';
    parsed.pathname = nextPath;
    parsed.search = '';
    parsed.hash = '';
    const normalizedUrl: string = parsed.toString().replace(/\/$/u, '');
    return {
      changed: normalizedUrl !== input,
      message: '检测到你填写的是具体接口地址，建议改为服务根地址。',
      normalizedUrl,
      requiresConfirmation: true,
      valid: true,
    };
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '') || '/';
  const normalizedUrl: string = parsed.toString().replace(/\/$/u, '');
  return {
    changed: normalizedUrl !== input,
    normalizedUrl,
    // Removing a trailing slash is lossless and should not create a second
    // confirmation step in the first-run wizard.
    requiresConfirmation: false,
    valid: true,
  };
}

export function normalizeProviderUrl(value: string): string {
  const result: ProviderUrlAnalysis = analyzeProviderUrl(value);
  if (!result.valid || !result.normalizedUrl) {
    throw new BadRequestException(result.message || 'API 地址无效');
  }
  return result.normalizedUrl;
}
