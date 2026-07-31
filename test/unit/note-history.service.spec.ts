import { NoteHistoryService } from '../../server/modules/note-jobs/note-history.service';

describe('NoteHistoryService', () => {
  it('ends every stale processing record after a service restart', async () => {
    const returning = jest.fn().mockResolvedValue([
      { jobId: 'first-job' },
      { jobId: 'second-job' },
    ]);
    const where = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const service: NoteHistoryService = Object.create(
      NoteHistoryService.prototype,
    );

    Reflect.set(service, 'db', { update });

    const count: number = await service.failAllInterrupted(
      '服务重启后任务执行上下文已丢失，请重新提交。',
    );

    expect(count).toBe(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStage: 'failed',
        status: 'failed',
        statusMessage: '服务重启导致处理任务中断，请重新提交',
      }),
    );
    expect(where).toHaveBeenCalledTimes(1);
  });
});
