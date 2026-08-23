import type {
  ConnectorCapability,
  ConnectorDescriptor,
  ConnectorType,
} from '@shared/api.interface';

export const CONNECTOR_CAPABILITIES: Record<
  ConnectorType,
  ConnectorCapability[]
> = {
  dingtalk: [
    'document.read',
    'document.write',
    'task.read',
    'task.write',
    'notification.send',
    'identity.read',
  ],
  feishu: [
    'document.read',
    'document.write',
    'document.media',
    'task.read',
    'task.write',
    'inbox.read',
    'notification.send',
    'identity.read',
  ],
};

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  dingtalk: '钉钉',
  feishu: '飞书',
};

export function isConnectorType(value: string): value is ConnectorType {
  return value === 'feishu' || value === 'dingtalk';
}

export function buildDescriptor(
  type: ConnectorType,
  enabled: boolean,
  configured: boolean,
  lastCheckedAt?: string,
  lastError?: string,
  taskExecutorUserId?: string,
  webhookConfigured = false,
  webhookSecretConfigured = false,
): ConnectorDescriptor {
  const status = !configured ? 'unconfigured' : lastError ? 'error' : 'ready';
  return {
    capabilities: CONNECTOR_CAPABILITIES[type],
    configured,
    enabled,
    label: CONNECTOR_LABELS[type],
    lastCheckedAt,
    lastError,
    status,
    taskExecutorUserId,
    type,
    webhookConfigured,
    webhookSecretConfigured,
  };
}
