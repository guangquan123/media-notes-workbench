import { FeishuAuthService } from '../../server/modules/connectors/feishu-auth.service';

describe('FeishuAuthService', () => {
  it('uses the CLI authorized open_id for task assignment', async () => {
    const service = new FeishuAuthService();
    jest
      .spyOn(service as never, 'run' as never)
      .mockResolvedValue({
        stderr: '',
        stdout: JSON.stringify({
          identities: {
            user: { available: true, openId: 'ou_cli_authorized', tokenStatus: 'valid' },
          },
        }),
      } as never);

    await expect(service.getAuthorizedOpenId()).resolves.toBe('ou_cli_authorized');
  });

  it('fails clearly when the CLI has no authorized open_id', async () => {
    const service = new FeishuAuthService();
    jest
      .spyOn(service as never, 'run' as never)
      .mockResolvedValue({ stderr: '', stdout: '{}' } as never);

    await expect(service.getAuthorizedOpenId()).rejects.toThrow('open_id');
  });
});
