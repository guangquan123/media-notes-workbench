import {
  BadRequestException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { getLocalConfigPath } from '../../common/utils/local-runtime-paths';
import type {
  AiModelCapability,
  AiModelSettings,
  CreateModelServiceProviderRequest,
  ModelProviderModel,
  ModelReference,
  ModelServiceProvider,
  ModelProviderModelsResponse,
  ModelProviderConnectionStatus,
  SetupModelValidationResponse,
  TranscriptionMode,
  UpdateAiModelSettingsRequest,
  UpdateModelServiceProviderRequest,
} from '@shared/api.interface';
import {
  ExternalModelRequestError,
  fetchExternalModelJson,
} from './external-model-request.utils';

export interface ModelProviderCredentials {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  model: string;
  providerId: string;
  providerName: string;
}

interface StoredModelProvider {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  id: string;
  models: ModelProviderModel[];
  name: string;
}

interface StoredModelReference {
  model: string;
  providerId: string;
}

interface StoredModelProviderConfig {
  providers: StoredModelProvider[];
  summaryModel?: StoredModelReference;
  transcriptionMode: TranscriptionMode;
  transcriptionModel?: StoredModelReference;
}

const CONFIG_FILE_NAME = '.model-provider-config.json';
const LEGACY_CONFIG_FILE_NAME = '.external-model-config.json';
const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-1';

@Injectable()
export class ModelProviderSettingsService {
  private readonly configPath: string;
  private current: StoredModelProviderConfig | undefined;

  constructor(@Optional() configPath?: string) {
    this.configPath = configPath || getLocalConfigPath(CONFIG_FILE_NAME);
  }

  async getPublicSettings(): Promise<AiModelSettings> {
    const config: StoredModelProviderConfig = await this.load();
    return {
      providers: config.providers.map(
        (provider: StoredModelProvider): ModelServiceProvider => ({
          apiKeyConfigured: Boolean(provider.apiKey),
          baseUrl: provider.baseUrl,
          configured: this.isProviderConfigured(provider),
          enabled: provider.enabled,
          id: provider.id,
          models: provider.models,
          name: provider.name,
        }),
      ),
      summaryModel: this.toPublicReference(config.summaryModel, config.providers),
      transcriptionMode: config.transcriptionMode,
      transcriptionModel: this.toPublicReference(
        config.transcriptionModel,
        config.providers,
      ),
    };
  }

  async createProvider(
    input: CreateModelServiceProviderRequest,
  ): Promise<ModelServiceProvider> {
    const config: StoredModelProviderConfig = await this.load();
    const provider: StoredModelProvider = {
      apiKey: input.apiKey?.trim() || '',
      baseUrl: normalizeBaseUrl(input.baseUrl),
      enabled: input.enabled,
      id: randomUUID(),
      models: [],
      name: normalizeProviderName(input.name),
    };
    this.assertProviderCanBeEnabled(provider);
    config.providers.push(provider);
    await this.save(config);
    return this.toPublicProvider(provider);
  }

  async updateProvider(
    id: string,
    input: UpdateModelServiceProviderRequest,
  ): Promise<ModelServiceProvider> {
    const config: StoredModelProviderConfig = await this.load();
    const provider: StoredModelProvider | undefined = config.providers.find(
      (item: StoredModelProvider): boolean => item.id === id,
    );
    if (!provider) throw new NotFoundException('模型服务提供者不存在');
    const next: StoredModelProvider = {
      ...provider,
      apiKey: input.apiKey?.trim() || provider.apiKey,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      enabled: input.enabled,
      name: normalizeProviderName(input.name),
    };
    this.assertProviderCanBeEnabled(next);
    const index: number = config.providers.findIndex(
      (item: StoredModelProvider): boolean => item.id === id,
    );
    config.providers[index] = next;
    await this.save(config);
    return this.toPublicProvider(next);
  }

  async deleteProvider(id: string): Promise<void> {
    const config: StoredModelProviderConfig = await this.load();
    const used: boolean = [config.transcriptionModel, config.summaryModel].some(
      (reference: StoredModelReference | undefined): boolean =>
        reference?.providerId === id,
    );
    if (used) throw new BadRequestException('该提供者已被模型配置引用，不能删除');
    const nextProviders: StoredModelProvider[] = config.providers.filter(
      (provider: StoredModelProvider): boolean => provider.id !== id,
    );
    if (nextProviders.length === config.providers.length) {
      throw new NotFoundException('模型服务提供者不存在');
    }
    config.providers = nextProviders;
    await this.save(config);
  }

  async getModelSettings(): Promise<AiModelSettings> {
    return this.getPublicSettings();
  }

  async updateModelSettings(
    input: UpdateAiModelSettingsRequest,
  ): Promise<AiModelSettings> {
    const config: StoredModelProviderConfig = await this.load();
    const transcriptionModel: StoredModelReference | undefined =
      input.transcriptionModel
        ? this.validateReference(input.transcriptionModel, config.providers)
        : undefined;
    const summaryModel: StoredModelReference | undefined = input.summaryModel
      ? this.validateReference(input.summaryModel, config.providers)
      : undefined;
    if (input.transcriptionMode === 'custom_api' && !transcriptionModel) {
      throw new BadRequestException('启用 API 转录前请先选择转录模型');
    }
    config.transcriptionMode = input.transcriptionMode;
    config.transcriptionModel = transcriptionModel;
    config.summaryModel = summaryModel;
    await this.save(config);
    return this.getPublicSettings();
  }

  async listModels(
    providerId: string,
    capability: AiModelCapability,
  ): Promise<ModelProviderModelsResponse> {
    const config: StoredModelProviderConfig = await this.load();
    const provider: StoredModelProvider = this.findProvider(
      providerId,
      config.providers,
    );
    if (!this.isProviderConfigured(provider)) {
      throw new BadRequestException('请先配置并启用该模型服务提供者');
    }
    try {
      const payload: unknown = await fetchExternalModelJson(
        `${provider.baseUrl}/models`,
        {
          headers: buildProviderHeaders(provider.apiKey),
          method: 'GET',
        },
        20_000,
        { maxAttempts: 1 },
      );
      const discovered: ModelProviderModel[] = parseModelList(payload, capability);
      if (discovered.length > 0) {
        provider.models = mergeProviderModels(provider.models, discovered);
        await this.save(config);
        return { items: discovered, providerId };
      }
    } catch {
      // Keep the last known list available when a provider has no /models endpoint.
    }
    const fallback: ModelProviderModel[] = provider.models.filter(
      (model: ModelProviderModel): boolean =>
        model.capabilities.includes(capability),
    );
    return { items: fallback, providerId };
  }

  async testConnection(
    providerId: string,
  ): Promise<ModelProviderConnectionStatus> {
    const config: StoredModelProviderConfig = await this.load();
    const provider: StoredModelProvider = this.findProvider(
      providerId,
      config.providers,
    );
    if (!this.isProviderConfigured(provider)) {
      throw new BadRequestException('请先填写 API 地址和必要凭据');
    }
    try {
      const payload: unknown = await fetchExternalModelJson(
        `${provider.baseUrl}/models`,
        {
          headers: buildProviderHeaders(provider.apiKey),
          method: 'GET',
        },
        20_000,
        { maxAttempts: 1 },
      );
      const modelCount: number = countModelItems(payload);
      return {
        checkedAt: new Date().toISOString(),
        message:
          modelCount > 0
            ? `连接成功，已读取 ${modelCount} 个模型。`
            : '连接成功，但服务未返回可选模型列表。',
        providerId,
        status: 'success',
      };
    } catch (error) {
      const message: string = error instanceof Error ? error.message : '未知错误';
      throw new BadRequestException(`提供者连通性测试失败：${message}`);
    }
  }

  async validateSummaryModel(
    providerId: string,
    requestedModel: string,
  ): Promise<SetupModelValidationResponse> {
    const config: StoredModelProviderConfig = await this.load();
    const provider: StoredModelProvider = this.findProvider(
      providerId,
      config.providers,
    );
    if (!this.isProviderConfigured(provider) || !provider.enabled) {
      throw new BadRequestException('请先配置并启用该模型服务提供者');
    }
    const model: string = requestedModel.trim();
    if (!model) throw new BadRequestException('模型名称不能为空');
    try {
      const payload: unknown = await this.requestSummaryCompletion(
        provider,
        model,
      );
      const output: string = extractCompletionText(payload);
      if (!output) {
        throw new Error('模型没有返回可用的文本结果');
      }
      return {
        checkedAt: new Date().toISOString(),
        kind: 'summary',
        message: '模型已完成一条最小总结测试。',
        model,
        providerId,
        status: 'success',
      };
    } catch (error) {
      const message: string = error instanceof Error ? error.message : '未知错误';
      throw new BadRequestException(`总结模型验证失败：${message}`);
    }
  }

  async validateTranscriptionModel(
    providerId: string,
    requestedModel: string,
  ): Promise<SetupModelValidationResponse> {
    const config: StoredModelProviderConfig = await this.load();
    const provider: StoredModelProvider = this.findProvider(
      providerId,
      config.providers,
    );
    if (!this.isProviderConfigured(provider) || !provider.enabled) {
      throw new BadRequestException('请先配置并启用该模型服务提供者');
    }
    const model: string = requestedModel.trim();
    if (!model) throw new BadRequestException('转录模型名称不能为空');

    const form: FormData = new FormData();
    const audio: Buffer = createSilentWav();
    const audioArrayBuffer: ArrayBuffer = new ArrayBuffer(audio.byteLength);
    new Uint8Array(audioArrayBuffer).set(audio);
    form.append(
      'file',
      new Blob([audioArrayBuffer], { type: 'audio/wav' }),
      'workbench-setup-check.wav',
    );
    form.append('model', model);
    form.append('response_format', 'json');
    const headers: Record<string, string> = buildProviderHeaders(
      provider.apiKey,
    );
    try {
      await this.requestTranscriptionCompletion(provider, form, headers);
      return {
        checkedAt: new Date().toISOString(),
        kind: 'transcription',
        message: '转录服务已接受一段最小测试音频。',
        model,
        providerId,
        status: 'success',
      };
    } catch (error) {
      const message: string = error instanceof Error ? error.message : '未知错误';
      throw new BadRequestException(`转录模型验证失败：${message}`);
    }
  }

  async getConfigurationFingerprint(
    capability: AiModelCapability,
  ): Promise<string | undefined> {
    const credentials: ModelProviderCredentials | undefined =
      await this.getCredentials(capability);
    if (!credentials) return undefined;
    return createHash('sha256')
      .update(
        [
          capability,
          credentials.providerId,
          credentials.baseUrl,
          credentials.model,
          credentials.apiKey,
        ].join('\u0000'),
      )
      .digest('hex');
  }

  async getCredentials(
    capability: AiModelCapability,
  ): Promise<ModelProviderCredentials | undefined> {
    const config: StoredModelProviderConfig = await this.load();
    const reference =
      capability === 'transcription'
        ? config.transcriptionModel
        : config.summaryModel;
    if (!reference) return undefined;
    const provider: StoredModelProvider = this.findProvider(
      reference.providerId,
      config.providers,
    );
    if (!provider.enabled || !this.isProviderConfigured(provider)) return undefined;
    return {
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      enabled: true,
      model: reference.model,
      providerId: provider.id,
      providerName: provider.name,
    };
  }

  async getTranscriptionMode(): Promise<TranscriptionMode> {
    const config: StoredModelProviderConfig = await this.load();
    return config.transcriptionMode;
  }

  async getTranscriptionSelection(
    requestedMode?: TranscriptionMode,
  ): Promise<{
    mode: TranscriptionMode;
    model: string;
    providerName: string;
  }> {
    const config: StoredModelProviderConfig = await this.load();
    const mode: TranscriptionMode = requestedMode || config.transcriptionMode;
    if (mode === 'tencent_asr') {
      return {
        mode: 'tencent_asr',
        model: '16k_zh_en_2.0',
        providerName: '腾讯 ASR 资源包',
      };
    }
    const credentials: ModelProviderCredentials | undefined =
      await this.getCredentials('transcription');
    if (!credentials) {
      throw new BadRequestException('API 转录已选择，但转录模型或提供者尚未配置');
    }
    return {
      mode: 'custom_api',
      model: credentials.model,
      providerName: credentials.providerName,
    };
  }

  async isCustomTranscriptionReady(): Promise<boolean> {
    const mode: TranscriptionMode = await this.getTranscriptionMode();
    if (mode !== 'custom_api') return false;
    return Boolean(await this.getCredentials('transcription'));
  }

  private async load(): Promise<StoredModelProviderConfig> {
    if (this.current) return this.current;
    try {
      const raw: string = await readFile(this.configPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      this.current = normalizeConfig(parsed);
      return this.current;
    } catch {
      this.current = await this.loadLegacyConfig();
      return this.current;
    }
  }

  private async loadLegacyConfig(): Promise<StoredModelProviderConfig> {
    try {
      const raw: string = await readFile(
        getLocalConfigPath(LEGACY_CONFIG_FILE_NAME),
        'utf8',
      );
      const parsed = JSON.parse(raw) as {
        apiKey?: string;
        baseUrl?: string;
        enabled?: boolean;
        model?: string;
      };
      if (parsed.baseUrl && parsed.apiKey && parsed.model) {
        const provider: StoredModelProvider = {
          apiKey: parsed.apiKey,
          baseUrl: normalizeBaseUrl(parsed.baseUrl),
          enabled: parsed.enabled !== false,
          id: 'legacy-external-model',
          models: [{ capabilities: ['llm'], id: parsed.model }],
          name: '原外部模型配置',
        };
        return {
          providers: [provider],
          summaryModel: { model: parsed.model, providerId: provider.id },
          transcriptionMode: 'tencent_asr',
        };
      }
    } catch {
      // No legacy configuration is a valid first-run state.
    }
    return { providers: [], transcriptionMode: 'tencent_asr' };
  }

  private async save(config: StoredModelProviderConfig): Promise<void> {
    const tempPath: string = `${this.configPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, this.configPath);
    this.current = config;
  }

  private findProvider(
    id: string,
    providers: StoredModelProvider[],
  ): StoredModelProvider {
    const provider: StoredModelProvider | undefined = providers.find(
      (item: StoredModelProvider): boolean => item.id === id,
    );
    if (!provider) throw new BadRequestException('模型服务提供者不存在');
    return provider;
  }

  private validateReference(
    input: ModelReference,
    providers: StoredModelProvider[],
  ): StoredModelReference {
    const provider: StoredModelProvider = this.findProvider(
      input.providerId,
      providers,
    );
    const model: string = input.model.trim();
    if (!model) throw new BadRequestException('模型名不能为空');
    if (!provider.enabled || !this.isProviderConfigured(provider)) {
      throw new BadRequestException('请选择已配置并启用的模型服务提供者');
    }
    return { model, providerId: provider.id };
  }

  private assertProviderCanBeEnabled(provider: StoredModelProvider): void {
    if (provider.enabled && !this.isProviderConfigured(provider)) {
      throw new BadRequestException(
        '启用前请填写 API 地址和 API Key；本机 Ollama 服务可不填写 API Key',
      );
    }
  }

  private isProviderConfigured(provider: StoredModelProvider): boolean {
    if (!provider.baseUrl) return false;
    if (provider.apiKey) return true;
    return isLoopbackHttpUrl(provider.baseUrl);
  }

  private async requestSummaryCompletion(
    provider: StoredModelProvider,
    model: string,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      ...buildProviderHeaders(provider.apiKey),
      'Content-Type': 'application/json',
    };
    try {
      return await fetchExternalModelJson(
        `${provider.baseUrl}/chat/completions`,
        {
          body: JSON.stringify({
            max_tokens: 8,
            messages: [{ content: '只回复 OK。', role: 'user' }],
            model,
            temperature: 0,
          }),
          headers,
          method: 'POST',
        },
        30_000,
        { maxAttempts: 1 },
      );
    } catch (error) {
      const status: number | undefined =
        error instanceof ExternalModelRequestError ? error.status : undefined;
      if (status !== 404 && status !== 405) throw error;
      return fetchExternalModelJson(
        `${provider.baseUrl}/responses`,
        {
          body: JSON.stringify({
            input: '只回复 OK。',
            max_output_tokens: 8,
            model,
          }),
          headers,
          method: 'POST',
        },
        30_000,
        { maxAttempts: 1 },
      );
    }
  }

  private async requestTranscriptionCompletion(
    provider: StoredModelProvider,
    form: FormData,
    headers: Record<string, string>,
  ): Promise<unknown> {
    try {
      return await fetchExternalModelJson(
        `${provider.baseUrl}/audio/transcriptions`,
        { body: form, headers, method: 'POST' },
        30_000,
        { maxAttempts: 1 },
      );
    } catch (error) {
      const status: number | undefined =
        error instanceof ExternalModelRequestError ? error.status : undefined;
      if (status !== 404 && status !== 405) throw error;
      return fetchExternalModelJson(
        `${provider.baseUrl}/audio/transcriptions/async`,
        { body: form, headers, method: 'POST' },
        30_000,
        { maxAttempts: 1 },
      );
    }
  }

  private toPublicProvider(
    provider: StoredModelProvider,
  ): ModelServiceProvider {
    return {
      apiKeyConfigured: Boolean(provider.apiKey),
      baseUrl: provider.baseUrl,
      configured: this.isProviderConfigured(provider),
      enabled: provider.enabled,
      id: provider.id,
      models: provider.models,
      name: provider.name,
    };
  }

  private toPublicReference(
    reference: StoredModelReference | undefined,
    providers: StoredModelProvider[],
  ): ModelReference | undefined {
    if (!reference) return undefined;
    const provider: StoredModelProvider | undefined = providers.find(
      (item: StoredModelProvider): boolean => item.id === reference.providerId,
    );
    if (!provider) return undefined;
    return {
      model: reference.model,
      providerId: provider.id,
      providerName: provider.name,
    };
  }
}

function normalizeProviderName(value: string): string {
  const name: string = value.trim().slice(0, 80);
  if (!name) throw new BadRequestException('提供者名称不能为空');
  return name;
}

function normalizeBaseUrl(value: string): string {
  const baseUrl: string = value.trim().replace(/\/+$/u, '');
  if (!baseUrl) throw new BadRequestException('API 地址不能为空');
  try {
    const parsed: URL = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol');
    }
    if (parsed.username || parsed.password) {
      throw new Error('credentials in URL are not supported');
    }
  } catch {
    throw new BadRequestException('API 地址必须是有效的 HTTP(S) 地址');
  }
  return baseUrl;
}

function buildProviderHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const parsed: URL = new URL(value);
    if (parsed.protocol !== 'http:') return false;
    const hostname: string = parsed.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}

function createSilentWav(): Buffer {
  const sampleRate: number = 16_000;
  const channels: number = 1;
  const bitsPerSample: number = 16;
  const sampleCount: number = Math.floor(sampleRate / 10);
  const dataSize: number = sampleCount * channels * (bitsPerSample / 8);
  const buffer: Buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function normalizeConfig(value: unknown): StoredModelProviderConfig {
  if (!value || typeof value !== 'object') {
    return { providers: [], transcriptionMode: 'tencent_asr' };
  }
  const input = value as Partial<StoredModelProviderConfig>;
  const providers: StoredModelProvider[] = Array.isArray(input.providers)
    ? input.providers.flatMap((item: unknown): StoredModelProvider[] => {
        if (!item || typeof item !== 'object') return [];
        const provider = item as Partial<StoredModelProvider>;
        if (
          typeof provider.id !== 'string' ||
          typeof provider.name !== 'string' ||
          typeof provider.baseUrl !== 'string'
        ) {
          return [];
        }
        return [
          {
            apiKey: typeof provider.apiKey === 'string' ? provider.apiKey : '',
            baseUrl: provider.baseUrl,
            enabled: provider.enabled !== false,
            id: provider.id,
            models: Array.isArray(provider.models)
              ? provider.models.filter(isModelProviderModel)
              : [],
            name: provider.name,
          },
        ];
      })
    : [];
  return {
    providers,
    summaryModel: normalizeReference(input.summaryModel),
    transcriptionMode:
      input.transcriptionMode === 'custom_api' ? 'custom_api' : 'tencent_asr',
    transcriptionModel: normalizeReference(input.transcriptionModel),
  };
}

function normalizeReference(value: unknown): StoredModelReference | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const reference = value as Partial<StoredModelReference>;
  if (typeof reference.providerId !== 'string' || typeof reference.model !== 'string') {
    return undefined;
  }
  return { model: reference.model, providerId: reference.providerId };
}

function isModelProviderModel(value: unknown): value is ModelProviderModel {
  if (!value || typeof value !== 'object') return false;
  const model = value as Partial<ModelProviderModel>;
  return (
    typeof model.id === 'string' &&
    Array.isArray(model.capabilities) &&
    model.capabilities.every(
      (capability: unknown): capability is AiModelCapability =>
        capability === 'transcription' || capability === 'llm',
    )
  );
}

function parseModelList(
  payload: unknown,
  capability: AiModelCapability,
): ModelProviderModel[] {
  if (!payload || typeof payload !== 'object') return [];
  const data: unknown = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item: unknown): ModelProviderModel[] => {
    const id: string =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
          ? String((item as { id: string }).id)
          : '';
    return id ? [{ capabilities: [capability], id }] : [];
  });
}

function countModelItems(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  const data: unknown = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data.length : 0;
}

function extractCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const response: Record<string, unknown> = payload as Record<string, unknown>;
  const choices: unknown = response.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') continue;
      const message: unknown = (choice as Record<string, unknown>).message;
      if (!message || typeof message !== 'object') continue;
      const content: unknown = (message as Record<string, unknown>).content;
      if (typeof content === 'string' && content.trim()) return content.trim();
    }
  }
  const output: unknown = response.output_text;
  return typeof output === 'string' ? output.trim() : '';
}

function mergeProviderModels(
  existing: ModelProviderModel[],
  discovered: ModelProviderModel[],
): ModelProviderModel[] {
  const models = new Map<string, ModelProviderModel>();
  for (const model of existing) {
    models.set(model.id, {
      ...model,
      capabilities: [...model.capabilities],
    });
  }
  for (const model of discovered) {
    const previous: ModelProviderModel | undefined = models.get(model.id);
    const capabilities: AiModelCapability[] = previous
      ? Array.from(new Set([...previous.capabilities, ...model.capabilities]))
      : [...model.capabilities];
    models.set(model.id, { ...model, capabilities });
  }
  return Array.from(models.values());
}
