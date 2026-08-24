import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type {
  ConnectorType,
  TaskNotificationConnectionStatus,
  TaskNotificationEvent,
} from '@shared/api.interface';
import { hasKnownDeadLoopbackProxy } from '../../common/utils/cli-command';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';

const WEBHOOK_TIMEOUT_MS = 5000;
const WEBHOOK_RETRY_DELAYS_MS = [1000, 3000] as const;
const FEISHU_WEBHOOK_HOSTS = ['open.feishu.cn', 'open.larksuite.com'] as const;

interface ConnectorWebhook {
  connectorType: ConnectorType;
  secret: string;
  url: string;
}

export interface TaskNotificationInput {
  error?: string;
  event: TaskNotificationEvent;
  id: string;
  message: string;
  resultUrl?: string;
  sourceType?: string;
  title?: string;
  todoTitles?: readonly string[];
  type: 'article-export' | 'note';
}

@Injectable()
export class TaskNotificationService {
  private readonly logger = new Logger(TaskNotificationService.name);
  private readonly notifiedEvents = new Set<string>();

  constructor(
    private readonly httpService: HttpService,
    private readonly connectorRegistryService: ConnectorRegistryService,
  ) {}

  async testConnectorWebhook(
    connectorType: ConnectorType,
  ): Promise<TaskNotificationConnectionStatus> {
    const webhook = await this.getConnectorWebhook(connectorType);
    if (!webhook) {
      throw new BadRequestException(
        `请先在${getConnectorLabel(connectorType)}连接器中配置任务完成通知 Webhook。`,
      );
    }

    const checkedAt = new Date().toISOString();
    try {
      const webhookLabel = getWebhookLabel(connectorType);
      await this.sendWithRetry(
        webhook,
        `内容工作台${webhookLabel}连通性测试成功。`,
      );
      return { checkedAt, message: `${webhookLabel}已连通。` };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      throw new BadRequestException(
        `${getWebhookLabel(connectorType)}连通性校验失败：${message}`,
      );
    }
  }

  async notifyTaskResult(input: TaskNotificationInput): Promise<void> {
    const eventKey = `${input.type}:${input.id}:${input.event}:${input.resultUrl || input.error || ''}`;
    if (this.notifiedEvents.has(eventKey)) return;
    this.notifiedEvents.add(eventKey);

    const activeConnector =
      await this.connectorRegistryService.getActiveConnector();
    let webhook: ConnectorWebhook | undefined;
    try {
      webhook = await this.getConnectorWebhook(activeConnector);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(
        `任务 ${input.id} 的${getConnectorLabel(activeConnector)}通知配置无效：${message}`,
      );
      return;
    }

    if (!webhook) return;
    try {
      await this.sendWithRetry(webhook, buildTaskText(input));
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(
        `任务 ${input.id} 的${getConnectorLabel(activeConnector)}通知失败：${message}`,
      );
    }
  }

  private async getConnectorWebhook(
    connectorType: ConnectorType,
  ): Promise<ConnectorWebhook | undefined> {
    const config = await this.connectorRegistryService.getConfig(connectorType);
    if (config.type !== connectorType) {
      this.logger.warn(
        `拒绝使用不匹配的通知配置：请求 ${getConnectorLabel(connectorType)}，实际为 ${getConnectorLabel(config.type)}`,
      );
      return undefined;
    }
    const rawUrl = config.webhookUrl.trim();
    if (!rawUrl) return undefined;
    return {
      connectorType,
      secret: config.webhookSecret.trim(),
      url: validateWebhookUrl(rawUrl, connectorType),
    };
  }

  private async sendWithRetry(
    webhook: ConnectorWebhook,
    text: string,
  ): Promise<void> {
    let lastError: Error = new Error(
      `${getWebhookLabel(webhook.connectorType)}请求失败`,
    );
    for (
      let attempt = 0;
      attempt <= WEBHOOK_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      try {
        await this.sendOnce(webhook, text);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('未知错误');
        const delay = WEBHOOK_RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) await wait(delay);
      }
    }
    throw lastError;
  }

  private async sendOnce(webhook: ConnectorWebhook, text: string): Promise<void> {
    const isDingTalk = webhook.connectorType === 'dingtalk';
    const timestamp = isDingTalk
      ? String(Date.now())
      : String(Math.floor(Date.now() / 1000));
    const body = isDingTalk
      ? { msgtype: 'text', text: { content: text } }
      : {
          content: { text },
          msg_type: 'text' as const,
          ...(webhook.secret
            ? { timestamp, sign: buildFeishuSign(timestamp, webhook.secret) }
            : {}),
        };
    const responseUrl =
      isDingTalk && webhook.secret
        ? `${webhook.url}${webhook.url.includes('?') ? '&' : '?'}timestamp=${timestamp}&sign=${encodeURIComponent(buildDingTalkSign(timestamp, webhook.secret))}`
        : webhook.url;
    const response = await this.httpService.axiosRef.post(responseUrl, body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `media-notes-workbench/${webhook.connectorType}-notification`,
      },
      maxRedirects: 0,
      proxy: hasKnownDeadLoopbackProxy() ? false : undefined,
      timeout: WEBHOOK_TIMEOUT_MS,
      validateStatus: (): boolean => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (isConnectorFailure(response.data)) {
      const failure = response.data;
      throw new Error(
        `${webhook.connectorType} 返回错误 ${failure.errcode ?? failure.code ?? failure.StatusCode}`,
      );
    }
  }
}

export function validateFeishuWebhookUrl(value: string): string {
  return validateWebhookUrl(value, 'feishu');
}

export function validateDingTalkWebhookUrl(value: string): string {
  return validateWebhookUrl(value, 'dingtalk');
}

function getConnectorLabel(connectorType: ConnectorType): string {
  return connectorType === 'dingtalk' ? '钉钉' : '飞书';
}

function getWebhookLabel(connectorType: ConnectorType): string {
  return `${getConnectorLabel(connectorType)}机器人`;
}

function validateWebhookUrl(value: string, connectorType: ConnectorType): string {
  const url = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Webhook 地址必须是有效的 URL。');
  }
  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('机器人地址必须使用 https 协议。');
  }
  if (parsed.username || parsed.password || url.length > 2048) {
    throw new BadRequestException('Webhook 地址格式不安全或过长。');
  }
  const allowedHosts =
    connectorType === 'dingtalk'
      ? ['oapi.dingtalk.com']
      : FEISHU_WEBHOOK_HOSTS;
  const requiredPath =
    connectorType === 'dingtalk' ? '/robot/send' : '/open-apis/bot/v2/hook/';
  if (
    !allowedHosts.some((host): boolean => host === parsed.hostname) ||
    !parsed.pathname.startsWith(requiredPath)
  ) {
    throw new BadRequestException(
      connectorType === 'feishu'
        ? '请填写飞书机器人提供的 Webhook 地址。'
        : '钉钉机器人 Webhook 地址格式不正确。',
    );
  }
  return url;
}

export function buildFeishuSign(timestamp: string, secret: string): string {
  return createHmac('sha256', `${timestamp}\n${secret}`).digest('base64');
}

export function buildDingTalkSign(timestamp: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${secret}`)
    .digest('base64');
}

export function buildTaskText(input: TaskNotificationInput): string {
  const statusLabel = {
    cancelled: '已取消',
    completed: '已完成',
    failed: '失败',
  };
  const taskLabel = { 'article-export': '文章导出', note: '多媒体笔记' };
  return [
    `【内容工作台】${taskLabel[input.type]}${statusLabel[input.event]}`,
    ...(input.title ? [`标题：${input.title}`] : []),
    ...(input.sourceType
      ? [
          `${input.type === 'note' ? '资料类型' : '目标平台'}：${formatTaskSourceType(input)}`,
        ]
      : []),
    ...(input.todoTitles
      ? [
          `待办：${input.todoTitles.length} 项`,
          ...(input.todoTitles.length > 0
            ? [`待办标题：${input.todoTitles.join('；')}`]
            : []),
        ]
      : []),
    `状态：${statusLabel[input.event]}`,
    `说明：${input.message}`,
    ...(input.error ? [`错误：${input.error}`] : []),
    ...(input.resultUrl ? [`结果链接：${input.resultUrl}`] : []),
  ].join('\n');
}

function formatTaskSourceType(input: TaskNotificationInput): string {
  if (input.type !== 'note') return input.sourceType || '';
  const labels: Readonly<Record<string, string>> = {
    audio: '录音',
    document: '文档',
    paired: '双源会议/培训',
    pdf: 'PDF 文档',
    platform: '平台视频',
    video: '视频',
  };
  return labels[input.sourceType || ''] || input.sourceType || '';
}

export function isConnectorFailure(
  value: unknown,
): value is { code?: number; errcode?: number; StatusCode?: number } {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as {
    code?: unknown;
    errcode?: unknown;
    StatusCode?: unknown;
  };
  return (
    (typeof result.code === 'number' && result.code !== 0) ||
    (typeof result.errcode === 'number' && result.errcode !== 0) ||
    (typeof result.StatusCode === 'number' && result.StatusCode !== 0)
  );
}

export const isFeishuFailure = isConnectorFailure;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve): void => {
    setTimeout(resolve, milliseconds);
  });
}
