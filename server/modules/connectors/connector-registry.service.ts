import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ConnectorSettingsResponse,
  ConnectorTestResponse,
  ConnectorType,
  UpdateConnectorRequest,
} from '@shared/api.interface';
import { buildDescriptor, isConnectorType } from './connector.utils';
import { FeishuAuthService } from './feishu-auth.service';
import { DingTalkAuthService } from './dingtalk-auth.service';

interface StoredConnectorConfig {
  activeConnector: ConnectorType;
  items: Array<{
    clientId: string;
    clientSecret: string;
    enabled: boolean;
    lastCheckedAt?: string;
    lastError?: string;
    type: ConnectorType;
    userId: string;
    webhookSecret: string;
    webhookUrl: string;
  }>;
}

const CONNECTOR_TYPES: ConnectorType[] = ['feishu', 'dingtalk'];

interface LegacyNotificationItem {
  connectorType?: string;
  enabled?: boolean;
  secret?: string;
  url?: string;
}

@Injectable()
export class ConnectorRegistryService {
  private readonly configPath: string;
  private readonly feishuAuthService?: FeishuAuthService;
  private readonly dingTalkAuthService?: DingTalkAuthService;
  private current: StoredConnectorConfig | undefined;

  constructor(
    @Optional() feishuAuthService?: FeishuAuthService,
    @Optional() dingTalkAuthService?: DingTalkAuthService,
    @Optional() baseDir?: string,
  ) {
    const testBaseDir =
      typeof (feishuAuthService as unknown) === 'string'
        ? String(feishuAuthService)
        : baseDir;
    this.feishuAuthService =
      typeof (feishuAuthService as unknown) === 'string'
        ? undefined
        : feishuAuthService;
    this.dingTalkAuthService = dingTalkAuthService;
    this.configPath = join(
      testBaseDir || process.cwd(),
      '.connector-config.json',
    );
  }

  async getSettings(): Promise<ConnectorSettingsResponse> {
    const config = await this.load();
    const authStatus = await this.resolveAuthStatus();
    return {
      activeConnector: config.activeConnector,
      items: CONNECTOR_TYPES.map((type: ConnectorType) => {
        const item = config.items.find((candidate) => candidate.type === type);
        const hasCustomConfig = Boolean(
          item?.clientId || item?.webhookUrl || item?.userId,
        );
        const authed = authStatus[type] ?? false;
        return buildDescriptor(
          type,
          type === config.activeConnector,
          hasCustomConfig || authed,
          item?.lastCheckedAt,
          item?.lastError,
          type === 'dingtalk' ? item?.userId || undefined : undefined,
          Boolean(item?.webhookUrl),
          Boolean(item?.webhookSecret),
        );
      }),
    };
  }

  private async resolveAuthStatus(): Promise<
    Record<'feishu' | 'dingtalk', boolean>
  > {
    const result: Record<'feishu' | 'dingtalk', boolean> = {
      feishu: false,
      dingtalk: false,
    };
    try {
      result.feishu =
        (await this.feishuAuthService?.isAuthenticated()) ?? false;
    } catch {
      // ignore: auth status unavailable
    }
    try {
      result.dingtalk =
        (await this.dingTalkAuthService?.isAuthenticated()) ?? false;
    } catch {
      // ignore: auth status unavailable
    }
    return result;
  }

  async getActiveConnector(): Promise<ConnectorType> {
    return (await this.load()).activeConnector;
  }

  async isActiveConnectorReady(): Promise<boolean> {
    const settings = await this.getSettings();
    const active = settings.items.find(
      (item) => item.type === settings.activeConnector,
    );
    return active?.status === 'ready';
  }

  async getActiveConfig(): Promise<
    StoredConnectorConfig['items'][number] & { type: ConnectorType }
  > {
    const config = await this.load();
    return this.getStoredItem(config, config.activeConnector);
  }

  async getConfig(
    typeValue: string,
  ): Promise<StoredConnectorConfig['items'][number] & { type: ConnectorType }> {
    const type = this.parseType(typeValue);
    const config = await this.load();
    return this.getStoredItem(config, type);
  }

  async update(
    typeValue: string,
    input: UpdateConnectorRequest,
  ): Promise<ConnectorSettingsResponse> {
    const type = this.parseType(typeValue);
    const config = await this.load();
    const existing = this.getStoredItem(config, type);
    const clearWebhook = input.clearWebhook === true;
    const next = {
      ...existing,
      clientId: input.clientId?.trim() || existing.clientId,
      clientSecret: input.clientSecret?.trim() || existing.clientSecret,
      enabled: type === config.activeConnector,
      type,
      userId: input.userId?.trim() || existing.userId,
      webhookSecret: clearWebhook
        ? ''
        : input.webhookSecret?.trim() || existing.webhookSecret,
      webhookUrl: clearWebhook
        ? ''
        : typeof input.webhookUrl === 'string'
          ? input.webhookUrl.trim()
          : existing.webhookUrl,
    };
    const items = config.items.filter((item) => item.type !== type);
    items.push(next);
    await this.save({ ...config, items });
    return this.getSettings();
  }

  async setDingTalkTaskExecutorUserId(userId: string): Promise<void> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new BadRequestException('钉钉授权用户未返回有效的 userId。');
    }
    const config = await this.load();
    const items = config.items.map((item) =>
      item.type === 'dingtalk' ? { ...item, userId: normalizedUserId } : item,
    );
    if (!items.some((item) => item.type === 'dingtalk')) {
      items.push({
        ...this.getStoredItem(config, 'dingtalk'),
        type: 'dingtalk',
        userId: normalizedUserId,
      });
    }
    await this.save({ ...config, items });
  }

  async setActive(typeValue: string): Promise<ConnectorSettingsResponse> {
    const type = this.parseType(typeValue);
    const settings = await this.getSettings();
    const selected = settings.items.find((item) => item.type === type);
    if (!selected || selected.status !== 'ready') {
      throw new BadRequestException(
        `${selected?.label || type} 连接器尚未就绪。`,
      );
    }
    const config = await this.load();
    await this.save({ ...config, activeConnector: type });
    return this.getSettings();
  }

  async test(typeValue: string): Promise<ConnectorTestResponse> {
    const type = this.parseType(typeValue);
    const checkedAt = new Date().toISOString();
    const settings = await this.getSettings();
    const selected = settings.items.find((item) => item.type === type);
    if (!selected?.configured) {
      return {
        checkedAt,
        connector: type,
        message: `${selected?.label || type} 连接器缺少必要配置。`,
        status: 'failed',
      };
    }
    const config = await this.load();
    const nextItems = config.items.map((candidate) =>
      candidate.type === type
        ? { ...candidate, lastCheckedAt: checkedAt, lastError: undefined }
        : candidate,
    );
    await this.save({ ...config, items: nextItems });
    return {
      checkedAt,
      connector: type,
      message: `${selected?.label || type} 连接器配置校验通过。`,
      status: 'success',
    };
  }

  private parseType(value: string): ConnectorType {
    if (!isConnectorType(value)) {
      throw new BadRequestException('不支持的连接器类型。');
    }
    return value;
  }

  private getStoredItem(
    config: StoredConnectorConfig,
    type: ConnectorType,
  ): StoredConnectorConfig['items'][number] {
    return (
      config.items.find((item) => item.type === type) || {
        clientId: '',
        clientSecret: '',
        enabled: false,
        type,
        userId: '',
        webhookSecret: '',
        webhookUrl: '',
      }
    );
  }

  private async load(): Promise<StoredConnectorConfig> {
    if (this.current) return this.current;
    try {
      const raw = await readFile(this.configPath, 'utf8');
      this.current = this.normalize(
        JSON.parse(raw) as Partial<StoredConnectorConfig>,
      );
    } catch {
      this.current = {
        activeConnector: 'feishu',
        items: CONNECTOR_TYPES.map((type: ConnectorType) =>
          this.getStoredItem({ activeConnector: 'feishu', items: [] }, type),
        ),
      };
    }
    const migrated = await this.migrateLegacyNotificationSecret(this.current);
    if (migrated !== this.current) await this.save(migrated);
    return this.current;
  }

  private normalize(
    input: Partial<StoredConnectorConfig>,
  ): StoredConnectorConfig {
    const rawItems = Array.isArray(input.items) ? input.items : [];
    const items = CONNECTOR_TYPES.map((type) => {
      const raw = rawItems.find((item) => item.type === type);
      return {
        clientId: typeof raw?.clientId === 'string' ? raw.clientId : '',
        clientSecret:
          typeof raw?.clientSecret === 'string' ? raw.clientSecret : '',
        enabled: type === input.activeConnector,
        lastCheckedAt:
          typeof raw?.lastCheckedAt === 'string'
            ? raw.lastCheckedAt
            : undefined,
        lastError:
          typeof raw?.lastError === 'string' ? raw.lastError : undefined,
        type,
        userId: typeof raw?.userId === 'string' ? raw.userId : '',
        webhookSecret:
          typeof raw?.webhookSecret === 'string' ? raw.webhookSecret : '',
        webhookUrl: typeof raw?.webhookUrl === 'string' ? raw.webhookUrl : '',
      };
    });
    return {
      activeConnector: isConnectorType(input.activeConnector || '')
        ? input.activeConnector!
        : 'feishu',
      items,
    };
  }

  private async migrateLegacyNotificationSecret(
    config: StoredConnectorConfig,
  ): Promise<StoredConnectorConfig> {
    const legacyPath = join(process.cwd(), '.task-notification-config.json');
    let legacyItems: LegacyNotificationItem[] = [];
    try {
      const raw: unknown = JSON.parse(await readFile(legacyPath, 'utf8'));
      if (
        typeof raw === 'object' &&
        raw !== null &&
        Array.isArray((raw as { items?: unknown }).items)
      ) {
        legacyItems = (raw as { items: LegacyNotificationItem[] }).items;
      }
    } catch {
      return config;
    }

    let changed = false;
    const items = config.items.map((item) => {
      if (!item.webhookUrl || item.webhookSecret) return item;
      const legacy = legacyItems.find((candidate) =>
        candidate.enabled === true &&
        (candidate.connectorType || 'feishu') === item.type &&
        candidate.url === item.webhookUrl &&
        typeof candidate.secret === 'string' &&
        candidate.secret.trim(),
      );
      if (!legacy?.secret) return item;
      changed = true;
      return { ...item, webhookSecret: legacy.secret.trim() };
    });
    return changed ? { ...config, items } : config;
  }

  private async save(config: StoredConnectorConfig): Promise<void> {
    const tempPath = `${this.configPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, this.configPath);
    this.current = config;
  }
}
