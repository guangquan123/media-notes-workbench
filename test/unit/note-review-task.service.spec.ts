import { NoteReviewTaskService } from '../../server/modules/note-jobs/note-review-task.service';

describe('NoteReviewTaskService', () => {
  it('creates the task with the CLI authorized open_id type', async () => {
    const service = new NoteReviewTaskService();
    const runCommand = jest
      .spyOn(service as never, 'runCommand' as never)
      .mockResolvedValue({
        stderr: '',
        stdout: JSON.stringify({ task: { guid: 'task-guid', url: 'https://example.com/task' } }),
      } as never);

    await expect(
      service.create({
        documentUrl: 'https://example.com/doc',
        jobId: 'job-123',
        larkOpenId: 'ou_cli_authorized',
        title: '测试笔记',
      }),
    ).resolves.toEqual({ guid: 'task-guid', url: 'https://example.com/task' });

    expect(runCommand).toHaveBeenCalledWith(
      'lark-cli',
      expect.arrayContaining(['--user-id-type', 'open_id']),
    );
  });
});
