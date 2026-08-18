import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ExternalModelConnectionStatus,
  ExternalModelSettings,
  UpdateExternalModelSettingsRequest,
} from '@shared/api.interface';

export interface ExternalModelCredentials {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  model: string;
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';

@Injectable()
export class ExternalModelSettingsService {
  private readonly configPath = join(
    process.cwd(),
    '.external-model-config.json',
  );
  private current: ExternalModelCredentials | undefined;

  constructor(@Optional() configPath?: string) {
    if (configPath) this.configPath = configPath;
  }

  async getPublicSettings(): Promise<ExternalModelSettings> {
    const current: ExternalModelCredentials = await this.load();
    return {
      apiKeyConfigured: Boolean(current.apiKey),
      baseUrl: current.baseUrl,
      configured: this.isConfigured(current),
      enabled: current.enabled,
      model: current.model,
    };
  }

  async getCredentials(): Promise<ExternalModelCredentials | undefined> {
    const current: ExternalModelCredentials = await this.load();
    return current.enabled && this.isConfigured(current) ? current : undefined;
  }

  async update(
    input: UpdateExternalModelSettingsRequest,
  ): Promise<ExternalModelSettings> {
    const current: ExternalModelCredentials = await this.load();
    const next: ExternalModelCredentials = {
      apiKey: input.apiKey?.trim() || current.apiKey,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      enabled: input.enabled,
      model: input.model.trim(),
    };
    if (next.enabled && !this.isConfigured(next)) {
      throw new BadRequestException(
        '启用前请填写 API 地址、模型名和 API Key。',
      );
    }
    const tempPath = `${this.configPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, this.configPath);
    this.current = next;
    return this.getPublicSettings();
  }

  async testConnection(): Promise<ExternalModelConnectionStatus> {
    const credentials: ExternalModelCredentials | undefined =
      await this.getCredentials();
    if (!credentials) {
      throw new BadRequestException('请先保存并启用外部大模型配置。');
    }
    const controller = new AbortController();
    const timeout = setTimeout((): void => controller.abort(), 20_000);
    try {
      const response: Response = await fetch(
        `${credentials.baseUrl}/chat/completions`,
        {
          body: JSON.stringify({
            max_tokens: 8,
            messages: [{ content: '请只回复：连接成功', role: 'user' }],
            model: credentials.model,
            stream: false,
            temperature: 0,
          }),
          headers: {
            Authorization: `Bearer ${credentials.apiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error(`服务返回 HTTP ${response.status}`);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content: unknown = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('服务未返回可用文本内容');
      }
      return {
        checkedAt: new Date().toISOString(),
        message: `已连通 ${credentials.model}。`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      throw new BadRequestException(`模型连通性校验失败：${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async load(): Promise<ExternalModelCredentials> {
    if (this.current) return this.current;

    let raw: string;
    try {
      raw = await readFile(this.configPath, 'utf8');
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) {
        throw new ServiceUnavailableException(
          '外部 AI 模型配置文件无法读取，请重新打开「模型设置」并保存配置后重试。',
        );
      }
      this.current = normalize({
        apiKey: process.env.EXTERNAL_MODEL_API_KEY,
        baseUrl: process.env.EXTERNAL_MODEL_BASE_URL,
        enabled: process.env.EXTERNAL_MODEL_ENABLED === 'true',
        model: process.env.EXTERNAL_MODEL_NAME,
      });
      return this.current;
    }

    let parsed: Partial<ExternalModelCredentials>;
    try {
      parsed = JSON.parse(raw) as Partial<ExternalModelCredentials>;
    } catch {
      throw new ServiceUnavailableException(
        '外部 AI 模型配置文件格式无效，请重新打开「模型设置」并保存配置后重试。',
      );
    }
    this.current = normalize(parsed);
    return this.current;
  }

  private isConfigured(settings: ExternalModelCredentials): boolean {
    return Boolean(settings.apiKey && settings.baseUrl && settings.model);
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function normalize(
  input: Partial<ExternalModelCredentials>,
): ExternalModelCredentials {
  return {
    apiKey: input.apiKey?.trim() || '',
    baseUrl: normalizeBaseUrl(input.baseUrl || DEFAULT_BASE_URL),
    enabled: input.enabled === true,
    model: input.model?.trim() || DEFAULT_MODEL,
  };
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/u, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('API 地址必须是有效的 http 或 https URL。');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException('API 地址仅支持 http 或 https 协议。');
  }
  return trimmed;
}
