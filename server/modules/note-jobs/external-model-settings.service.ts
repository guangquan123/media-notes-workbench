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
  ExternalModelQuotaStatus,
  ExternalModelSettings,
  UpdateExternalModelSettingsRequest,
} from '@shared/api.interface';
import { fetchExternalModelJson } from './external-model-request.utils';
import { extractExternalModelText } from './external-model-response.utils';
import {
  getExternalModelBalanceEndpoint,
  getExternalModelProvider,
  parseExternalModelBalance,
} from './external-model-balance.utils';
import {
  ModelProviderSettingsService,
  type ModelProviderCredentials,
} from './model-provider-settings.service';

export interface ExternalModelCredentials {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  model: string;
  providerId?: string;
  providerName?: string;
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

  constructor(
    @Optional() configPath?: string,
    @Optional()
    private readonly providerSettingsService?: ModelProviderSettingsService,
  ) {
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
    if (this.providerSettingsService) {
      const unified: ModelProviderCredentials | undefined =
        await this.providerSettingsService.getCredentials('llm');
      if (unified) return unified;
    }
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
    try {
      const payload: unknown = await fetchExternalModelJson(
        `${credentials.baseUrl}/chat/completions`,
        {
          body: JSON.stringify({
            max_tokens: 128,
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
        },
        20_000,
      );
      if (!extractExternalModelText(payload)) {
        throw new Error('服务未返回可用文本内容');
      }
      return {
        checkedAt: new Date().toISOString(),
        message: `已验证 ${credentials.model} 的基础连通性（短请求）；长文本生成遇到瞬时断连时，系统会自动重试。`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      throw new BadRequestException(`模型连通性校验失败：${message}`);
    }
  }

  async getQuotaStatus(): Promise<ExternalModelQuotaStatus> {
    const checkedAt: string = new Date().toISOString();
    const credentials: ExternalModelCredentials | undefined =
      await this.getCredentials();
    if (!credentials) {
      return {
        checkedAt,
        message: '外部大模型尚未启用或配置不完整，暂时无法查询余额。',
        provider: credentials?.baseUrl || '未配置',
        status: 'not_configured',
      };
    }
    const endpoint: string | null = getExternalModelBalanceEndpoint(
      credentials.baseUrl,
    );
    const provider: string = getExternalModelProvider(credentials.baseUrl);
    if (!endpoint) {
      return {
        checkedAt,
        message: '当前 Provider 未提供已适配的余额查询接口，无法可靠显示剩余量。',
        provider,
        status: 'unsupported',
      };
    }
    try {
      const payload: unknown = await fetchExternalModelJson(
        endpoint,
        {
          headers: { Authorization: `Bearer ${credentials.apiKey}` },
          method: 'GET',
        },
        20_000,
      );
      const balance = parseExternalModelBalance(payload);
      if (!balance.totalBalance) {
        return {
          checkedAt,
          message: 'Provider 未返回可用余额数值，请到控制台核对。',
          provider,
          status: 'unavailable',
        };
      }
      return {
        checkedAt,
        currency: balance.currency || undefined,
        message: balance.available
          ? '已读取外部模型账户余额。'
          : '外部模型账户余额不足，生成请求可能失败，请及时充值。',
          provider,
        status: balance.available ? 'available' : 'depleted',
        totalBalance: balance.totalBalance,
      };
    } catch (error) {
      const message: string = error instanceof Error ? error.message : '未知错误';
      return {
        checkedAt,
        message: `外部模型余额查询失败：${message}`,
        provider,
        status: 'unavailable',
      };
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
