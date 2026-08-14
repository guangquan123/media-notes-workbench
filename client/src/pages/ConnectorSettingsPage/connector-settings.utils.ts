import type {
  ConnectorStatus,
  ConnectorType,
} from '@shared/api.interface';

export interface ConnectorDraft {
  clientId: string;
  clientSecret: string;
  userId: string;
  webhookUrl: string;
}

export interface ConnectorDraftErrors {
  clientId?: string;
  clientSecret?: string;
  webhookUrl?: string;
}

export type ConnectorAction =
  | 'active'
  | 'configure'
  | 'enable-local'
  | 'set-active'
  | 'repair';

export function getConnectorAction(
  type: ConnectorType,
  status: ConnectorStatus,
  active: boolean,
): ConnectorAction {
  if (active) return 'active';
  if (type === 'local') return 'enable-local';
  if (status === 'ready') return 'set-active';
  if (status === 'error') return 'repair';
  return 'configure';
}

export function getConnectorStatusLabel(
  status: ConnectorStatus,
  active: boolean,
): string {
  if (active) return '当前使用';
  if (status === 'ready') return '已连接';
  if (status === 'error') return '连接异常';
  if (status === 'disabled') return '已断开';
  return '待配置';
}

export function validateConnectorDraft(
  type: ConnectorType,
  draft: ConnectorDraft,
  useCustomFeishuApp: boolean,
): ConnectorDraftErrors {
  const errors: ConnectorDraftErrors = {};
  if (type === 'feishu' && useCustomFeishuApp) {
    if (!draft.clientId.trim()) errors.clientId = '请输入飞书 App ID';
    if (!draft.clientSecret.trim()) {
      errors.clientSecret = '请输入飞书 App Secret';
    }
  }
  if (draft.webhookUrl.trim()) {
    try {
      const url = new URL(draft.webhookUrl.trim());
      if (url.protocol !== 'https:') {
        errors.webhookUrl = 'Webhook 必须使用 HTTPS 地址';
      }
    } catch {
      errors.webhookUrl = '请输入有效的 Webhook 地址';
    }
  }
  return errors;
}

export function hasConnectorDraftChanges(draft: ConnectorDraft): boolean {
  return Boolean(
    draft.clientId.trim() ||
      draft.clientSecret.trim() ||
      draft.userId.trim() ||
      draft.webhookUrl.trim(),
  );
}
