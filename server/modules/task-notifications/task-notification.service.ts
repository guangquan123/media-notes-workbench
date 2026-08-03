import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CreateTaskNotificationWebhookRequest,
  TaskNotificationConnectionStatus,
  TaskNotificationEvent,
  TaskNotificationSettings,
  TaskNotificationWebhook,
  UpdateTaskNotificationWebhookRequest,
} from '@shared/api.interface';

const MAX_WEBHOOKS = 20;
const WEBHOOK_TIMEOUT_MS = 5000;
const WEBHOOK_RETRY_DELAYS_MS = [1000, 3000] as const;
const FEISHU_WEBHOOK_HOSTS = ['open.feishu.cn', 'open.larksuite.com'] as const;

interface StoredWebhook {
  enabled: boolean;
  id: string;
  lastTestAt?: string;
  lastTestMessage?: string;
  lastTestStatus?: 'success' | 'failed';
  name: string;
  secret: string;
  url: string;
}

interface StoredConfig {
  items: StoredWebhook[];
}

export interface TaskNotificationInput {
  error?: string;
  event: TaskNotificationEvent;
  id: string;
  message: string;
  resultUrl?: string;
  sourceType?: string;
  title?: string;
  type: 'article-export' | 'note';
}

@Injectable()
export class TaskNotificationService {
  private readonly logger = new Logger(TaskNotificationService.name);
  private readonly configPath = join(
    process.cwd(),
    '.task-notification-config.json',
  );
  private current: StoredConfig | undefined;
  private readonly notifiedEvents = new Set<string>();

  constructor(private readonly httpService: HttpService) {}

  async getSettings(): Promise<TaskNotificationSettings> {
    const config: StoredConfig = await this.load();
    return {
      configured: config.items.length > 0,
      items: config.items.map((item: StoredWebhook): TaskNotificationWebhook => ({
        enabled: item.enabled,
        id: item.id,
        lastTestAt: item.lastTestAt,
        lastTestMessage: item.lastTestMessage,
        lastTestStatus: item.lastTestStatus,
        name: item.name,
        secretConfigured: Boolean(item.secret),
        url: maskWebhookUrl(item.url),
      })),
    };
  }

  async create(
    input: CreateTaskNotificationWebhookRequest,
  ): Promise<TaskNotificationSettings> {
    const config: StoredConfig = await this.load();
    if (config.items.length >= MAX_WEBHOOKS) {
      throw new BadRequestException(`最多配置 ${MAX_WEBHOOKS} 个飞书机器人。`);
    }
    const next: StoredWebhook = {
      enabled: input.enabled,
      id: randomUUID(),
      name: validateName(input.name),
      secret: input.secret?.trim() || '',
      url: validateFeishuWebhookUrl(input.url),
    };
    this.assertUniqueUrl(config.items, next.url);
    await this.save({ items: [...config.items, next] });
    return this.getSettings();
  }

  async update(
    id: string,
    input: UpdateTaskNotificationWebhookRequest,
  ): Promise<TaskNotificationSettings> {
    const config: StoredConfig = await this.load();
    const current: StoredWebhook | undefined = config.items.find(
      (item: StoredWebhook): boolean => item.id === id,
    );
    if (!current) throw new BadRequestException('飞书机器人配置不存在。');
    const url: string = input.url.trim()
      ? validateFeishuWebhookUrl(input.url)
      : current.url;
    this.assertUniqueUrl(config.items, url, id);
    const next: StoredWebhook = {
      ...current,
      enabled: input.enabled,
      name: validateName(input.name),
      secret: input.secret?.trim() || current.secret,
      url,
    };
    await this.save({
      items: config.items.map(
        (item: StoredWebhook): StoredWebhook => item.id === id ? next : item,
      ),
    });
    return this.getSettings();
  }

  async remove(id: string): Promise<TaskNotificationSettings> {
    const config: StoredConfig = await this.load();
    const nextItems: StoredWebhook[] = config.items.filter(
      (item: StoredWebhook): boolean => item.id !== id,
    );
    if (nextItems.length === config.items.length) {
      throw new BadRequestException('飞书机器人配置不存在。');
    }
    await this.save({ items: nextItems });
    return this.getSettings();
  }

  async test(
    id: string,
  ): Promise<TaskNotificationConnectionStatus> {
    const config: StoredConfig = await this.load();
    const webhook: StoredWebhook | undefined = config.items.find(
      (item: StoredWebhook): boolean => item.id === id,
    );
    if (!webhook) throw new BadRequestException('飞书机器人配置不存在。');
    return this.testWebhook(webhook, config);
  }

  async testInput(
    input: CreateTaskNotificationWebhookRequest,
  ): Promise<TaskNotificationConnectionStatus> {
    const webhook: StoredWebhook = {
      enabled: input.enabled,
      id: 'test',
      name: validateName(input.name),
      secret: input.secret?.trim() || '',
      url: validateFeishuWebhookUrl(input.url),
    };
    return this.sendTest(webhook);
  }

  async notifyTaskResult(input: TaskNotificationInput): Promise<void> {
    const eventKey: string = `${input.type}:${input.id}:${input.event}:${input.resultUrl || input.error || ''}`;
    if (this.notifiedEvents.has(eventKey)) return;
    this.notifiedEvents.add(eventKey);

    const config: StoredConfig = await this.load();
    const webhooks: StoredWebhook[] = config.items.filter(
      (item: StoredWebhook): boolean => item.enabled,
    );
    await Promise.all(
      webhooks.map(async (webhook: StoredWebhook): Promise<void> => {
        try {
          await this.sendWithRetry(webhook, buildTaskText(input));
        } catch (error) {
          const message: string = error instanceof Error ? error.message : '未知错误';
          this.logger.warn(
            `任务 ${input.id} 的飞书通知失败（配置 ${webhook.name}）：${message}`,
          );
        }
      }),
    );
  }

  private async testWebhook(
    webhook: StoredWebhook,
    config: StoredConfig,
  ): Promise<TaskNotificationConnectionStatus> {
    const checkedAt: string = new Date().toISOString();
    try {
      await this.sendWithRetry(webhook, '内容工作台飞书机器人连通性测试成功。');
      await this.saveTestResult(config, webhook.id, {
        lastTestAt: checkedAt,
        lastTestMessage: '飞书机器人已连通。',
        lastTestStatus: 'success',
      });
      return { checkedAt, message: '飞书机器人已连通。' };
    } catch (error) {
      const message: string = error instanceof Error ? error.message : '未知错误';
      await this.saveTestResult(config, webhook.id, {
        lastTestAt: checkedAt,
        lastTestMessage: message,
        lastTestStatus: 'failed',
      });
      throw new BadRequestException(`飞书机器人连通性校验失败：${message}`);
    }
  }

  private async sendTest(
    webhook: StoredWebhook,
  ): Promise<TaskNotificationConnectionStatus> {
    const checkedAt: string = new Date().toISOString();
    try {
      await this.sendWithRetry(webhook, '内容工作台飞书机器人连通性测试成功。');
      return { checkedAt, message: '飞书机器人已连通。' };
    } catch (error) {
      const message: string = error instanceof Error ? error.message : '未知错误';
      throw new BadRequestException(`飞书机器人连通性校验失败：${message}`);
    }
  }

  private async sendWithRetry(
    webhook: StoredWebhook,
    text: string,
  ): Promise<void> {
    let lastError: Error = new Error('飞书机器人请求失败');
    for (let attempt = 0; attempt <= WEBHOOK_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await this.sendOnce(webhook, text);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('未知错误');
        const delay: number | undefined = WEBHOOK_RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) await wait(delay);
      }
    }
    throw lastError;
  }

  private async sendOnce(webhook: StoredWebhook, text: string): Promise<void> {
    const timestamp: string = String(Math.floor(Date.now() / 1000));
    const body: { content: { text: string }; msg_type: 'text'; timestamp?: string; sign?: string } = {
      content: { text },
      msg_type: 'text',
    };
    if (webhook.secret) {
      body.timestamp = timestamp;
      body.sign = buildFeishuSign(timestamp, webhook.secret);
    }
    const response = await this.httpService.axiosRef.post(webhook.url, body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'media-notes-workbench/feishu-notification',
      },
      maxRedirects: 0,
      timeout: WEBHOOK_TIMEOUT_MS,
      validateStatus: (): boolean => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    const responseBody: unknown = response.data;
    if (isFeishuFailure(responseBody)) {
      throw new Error(`飞书返回错误 ${responseBody.code ?? responseBody.StatusCode}`);
    }
  }

  private assertUniqueUrl(
    items: StoredWebhook[],
    url: string,
    currentId?: string,
  ): void {
    if (items.some((item: StoredWebhook): boolean => item.url === url && item.id !== currentId)) {
      throw new BadRequestException('相同的飞书机器人地址不能重复配置。');
    }
  }

  private async saveTestResult(
    config: StoredConfig,
    id: string,
    result: Pick<StoredWebhook, 'lastTestAt' | 'lastTestMessage' | 'lastTestStatus'>,
  ): Promise<void> {
    await this.save({
      items: config.items.map(
        (item: StoredWebhook): StoredWebhook => item.id === id ? { ...item, ...result } : item,
      ),
    });
  }

  private async load(): Promise<StoredConfig> {
    if (this.current) return this.current;
    try {
      const raw: string = await readFile(this.configPath, 'utf8');
      this.current = normalizeConfig(JSON.parse(raw) as Partial<StoredConfig>);
    } catch {
      this.current = { items: [] };
    }
    return this.current;
  }

  private async save(config: StoredConfig): Promise<void> {
    const tempPath: string = `${this.configPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, this.configPath);
    this.current = config;
  }
}

function validateName(value: string): string {
  const name: string = value.trim();
  if (!name || name.length > 80) {
    throw new BadRequestException('名称不能为空且不能超过 80 个字符。');
  }
  return name;
}

export function validateFeishuWebhookUrl(value: string): string {
  const url: string = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Webhook 地址必须是有效的 URL。');
  }
  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('飞书机器人地址必须使用 https 协议。');
  }
  if (parsed.username || parsed.password || url.length > 2048) {
    throw new BadRequestException('Webhook 地址格式不安全或过长。');
  }
  if (
    !FEISHU_WEBHOOK_HOSTS.some(
      (host: string): boolean => host === parsed.hostname,
    ) ||
    !parsed.pathname.startsWith('/open-apis/bot/v2/hook/')
  ) {
    throw new BadRequestException('请填写飞书机器人提供的 Webhook 地址。');
  }
  return url;
}

function normalizeConfig(input: Partial<StoredConfig>): StoredConfig {
  const rawItems: unknown = input.items;
  if (!Array.isArray(rawItems)) return { items: [] };
  const items: StoredWebhook[] = rawItems
    .filter((item: unknown): item is Partial<StoredWebhook> => isObject(item))
    .map((item: Partial<StoredWebhook>): StoredWebhook => ({
      enabled: item.enabled === true,
      id: typeof item.id === 'string' && item.id ? item.id : randomUUID(),
      lastTestAt: typeof item.lastTestAt === 'string' ? item.lastTestAt : undefined,
      lastTestMessage: typeof item.lastTestMessage === 'string' ? item.lastTestMessage : undefined,
      lastTestStatus: item.lastTestStatus === 'success' || item.lastTestStatus === 'failed' ? item.lastTestStatus : undefined,
      name: typeof item.name === 'string' ? item.name.slice(0, 80) : '飞书机器人',
      secret: typeof item.secret === 'string' ? item.secret : '',
      url: typeof item.url === 'string' ? item.url : '',
    }))
    .filter((item: StoredWebhook): boolean => item.url.length > 0)
    .slice(0, MAX_WEBHOOKS);
  return { items };
}

function isObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null;
}

function maskWebhookUrl(url: string): string {
  try {
    const parsed: URL = new URL(url);
    if (parsed.search) parsed.search = '?••••';
    return parsed.toString();
  } catch {
    return '已配置';
  }
}

export function buildFeishuSign(timestamp: string, secret: string): string {
  const stringToSign: string = `${timestamp}\n${secret}`;
  return createHmac('sha256', stringToSign).digest('base64');
}

export function buildTaskText(input: TaskNotificationInput): string {
  const statusLabel: { completed: string; failed: string; cancelled: string } = {
    cancelled: '已取消',
    completed: '已完成',
    failed: '失败',
  };
  const taskLabel: { 'article-export': string; note: string } = {
    'article-export': '飞书文章导出',
    note: '多媒体笔记',
  };
  const lines: string[] = [
    `【内容工作台】${taskLabel[input.type]}${statusLabel[input.event]}`,
    `任务 ID：${input.id}`,
    ...(input.title ? [`标题：${input.title}`] : []),
    ...(input.sourceType ? [`资料类型：${input.sourceType}`] : []),
    `状态：${statusLabel[input.event]}`,
    `说明：${input.message}`,
    ...(input.error ? [`错误：${input.error}`] : []),
    ...(input.resultUrl ? [`结果链接：${input.resultUrl}`] : []),
  ];
  return lines.join('\n');
}

export function isFeishuFailure(
  value: unknown,
): value is { code?: number; StatusCode?: number } {
  if (!isObject(value)) return false;
  return (
    (typeof value.code === 'number' && value.code !== 0) ||
    (typeof value.StatusCode === 'number' && value.StatusCode !== 0)
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve: () => void): void => {
    setTimeout(resolve, milliseconds);
  });
}
