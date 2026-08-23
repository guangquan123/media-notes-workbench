import {
  buildDescriptor,
  isConnectorType,
} from '../../server/modules/connectors/connector.utils';

describe('connector utils', () => {
  it('recognizes only supported connector types', () => {
    expect(isConnectorType('local')).toBe(false);
    expect(isConnectorType('feishu')).toBe(true);
    expect(isConnectorType('dingtalk')).toBe(true);
    expect(isConnectorType('wechat')).toBe(false);
  });

  it('derives readiness status without exposing credentials', () => {
    expect(buildDescriptor('feishu', true, false).status).toBe('unconfigured');
    expect(buildDescriptor('dingtalk', false, true).status).toBe('ready');
    expect(
      buildDescriptor('feishu', true, true, undefined, 'timeout').status,
    ).toBe('error');
  });
});
