import { DingTalkTaskService } from '../../server/modules/connectors/dingtalk-task.service';

type CommandResult = { stderr: string; stdout: string };
type CommandRunner = (
  command: string,
  args: string[],
) => Promise<CommandResult>;

describe('DingTalkTaskService', () => {
  it('creates a personal todo with the configured executor and parses taskId', async () => {
    const service = new DingTalkTaskService();
    const runner = jest.fn<
      ReturnType<CommandRunner>,
      Parameters<CommandRunner>
    >(async () => ({
      stderr: '',
      stdout: JSON.stringify({ result: { taskId: 'todo-123' } }),
    }));
    (service as unknown as { runCommand: CommandRunner }).runCommand = runner;

    await expect(
      service.create({ executorUserId: 'user-123', title: '复核钉钉文档' }),
    ).resolves.toEqual({ guid: 'todo-123', url: null });
    expect(runner).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        'todo',
        'task',
        'create',
        '--title',
        '复核钉钉文档',
        '--executors',
        'user-123',
        '--format',
        'json',
      ]),
    );
  });

  it('reports a clear error when DingTalk does not return a taskId', async () => {
    const service = new DingTalkTaskService();
    (service as unknown as { runCommand: CommandRunner }).runCommand =
      async () => ({
        stderr: 'missing task id',
        stdout: JSON.stringify({ result: {} }),
      });

    await expect(
      service.create({ executorUserId: 'user-123', title: '创建待办' }),
    ).rejects.toThrow('missing task id');
  });

  it('marks the created todo as complete with its task id', async () => {
    const service = new DingTalkTaskService();
    const runner = jest.fn<
      ReturnType<CommandRunner>,
      Parameters<CommandRunner>
    >(async () => ({ stderr: '', stdout: '{}' }));
    (service as unknown as { runCommand: CommandRunner }).runCommand = runner;

    await service.complete('todo-123');

    expect(runner).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        'todo',
        'task',
        'done',
        '--task-id',
        'todo-123',
        '--status',
        'true',
        '--format',
        'json',
      ]),
    );
  });
});
