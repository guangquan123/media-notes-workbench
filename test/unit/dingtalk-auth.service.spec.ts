import { DingTalkAuthService } from '../../server/modules/connectors/dingtalk-auth.service';

type CommandResult = { stdout: string; stderr: string };
type CommandRunner = (
  command: string,
  args: string[],
) => Promise<CommandResult>;

describe('DingTalkAuthService', () => {
  it('reads the authorized userId through the current-user contact command', async () => {
    const service = new DingTalkAuthService();
    const invocations: Array<{ command: string; args: string[] }> = [];
    const runner: CommandRunner = async (command, args) => {
      invocations.push({ command, args });
      return {
        stdout: JSON.stringify({ result: { userId: 'ding-user-123' } }),
        stderr: '',
      };
    };
    (service as unknown as { run: CommandRunner }).run = runner;

    await expect(service.getAuthorizedUser()).resolves.toEqual({
      userId: 'ding-user-123',
    });
    expect(invocations).toEqual([
      {
        command: process.platform === 'win32' ? 'dws.cmd' : 'dws',
        args: ['contact', 'user', 'get-self', '--format', 'json'],
      },
    ]);
  });

  it('requires a real userId instead of accepting another identity field', async () => {
    const service = new DingTalkAuthService();
    const runner: CommandRunner = async () => ({
      stdout: JSON.stringify({ result: { openDingTalkId: 'opaque-id' } }),
      stderr: '',
    });
    (service as unknown as { run: CommandRunner }).run = runner;

    await expect(service.getAuthorizedUser()).rejects.toThrow(
      '钉钉授权用户信息未返回 userId',
    );
  });
});
