import {
  buildReviewTaskPayload,
  getShanghaiAllDayTimestamp,
} from '../../server/modules/note-jobs/note-review-task.utils';

describe('note review task utilities', () => {
  it('creates an all-day task payload assigned to the note owner', () => {
    const payload = buildReviewTaskPayload({
      documentUrl: 'https://example.com/doc',
      jobId: 'job-123',
      larkOpenId: 'ou_123',
      now: new Date('2026-07-16T01:20:00.000Z'),
      title: '系统思考方法',
    });

    expect(payload.client_token).toBe('note-review-job-123');
    expect(payload.due.is_all_day).toBe(true);
    expect(payload.due.timestamp).toBe(
      getShanghaiAllDayTimestamp(new Date('2026-07-16T01:20:00.000Z')),
    );
    expect(payload.members).toEqual([{ id: 'ou_123', role: 'assignee' }]);
    expect(payload.summary).toBe('处理学习笔记：系统思考方法');
  });
});
