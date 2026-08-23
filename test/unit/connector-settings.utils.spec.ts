import {
  getConnectorAction,
  getConnectorStatusLabel,
  validateConnectorDraft,
  type ConnectorDraft,
} from '../../client/src/pages/ConnectorSettingsPage/connector-settings.utils';

const emptyDraft: ConnectorDraft = {
  clientId: '',
  clientSecret: '',
  userId: '',
  webhookSecret: '',
  webhookUrl: '',
};

describe('connector settings interaction rules', () => {
  it('treats a ready inactive connector as available to activate', () => {
    expect(getConnectorAction('feishu', 'ready', false)).toBe('set-active');
    expect(getConnectorAction('feishu', 'ready', true)).toBe('active');
  });

  it('requires both credentials for a Feishu custom app', () => {
    expect(validateConnectorDraft('feishu', emptyDraft, true)).toEqual({
      clientId: '请输入飞书 App ID',
      clientSecret: '请输入飞书 App Secret',
    });
  });

  it('does not require unused client credentials for DingTalk', () => {
    expect(validateConnectorDraft('dingtalk', emptyDraft, false)).toEqual({});
  });

  it('validates optional webhook URLs when provided', () => {
    expect(
      validateConnectorDraft('feishu', { ...emptyDraft, webhookUrl: 'http://example.com' }, false),
    ).toEqual({ webhookUrl: 'Webhook 必须使用 HTTPS 地址' });
  });

  it('provides stable labels for every connector state', () => {
    expect(getConnectorStatusLabel('unconfigured', false)).toBe('待配置');
    expect(getConnectorStatusLabel('ready', false)).toBe('已连接');
    expect(getConnectorStatusLabel('ready', true)).toBe('当前使用');
    expect(getConnectorStatusLabel('error', false)).toBe('连接异常');
  });
});
