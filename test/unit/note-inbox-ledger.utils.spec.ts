import {
  buildInboxSubject,
  classifyInboxLink,
  summarizeInboxMessages,
} from '../../server/modules/note-inbox/note-inbox-ledger.utils';

describe('note inbox ledger utilities', () => {
  it('uses a stable canonical key for identical Douyin share links', () => {
    const first = classifyInboxLink('https://v.douyin.com/AbCd123/');
    const second = classifyInboxLink('https://v.douyin.com/AbCd123/');

    expect(first?.canonicalKey).toBe(second?.canonicalKey);
    expect(first?.platform).toBe('douyin');
  });

  it('identifies the same Bilibili video despite tracking parameters', () => {
    const first = classifyInboxLink('https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333.1');
    const second = classifyInboxLink('https://www.bilibili.com/video/BV1xx411c7mD?from=search');

    expect(first?.canonicalKey).toBe('bilibili:bv1xx411c7md');
    expect(second?.canonicalKey).toBe(first?.canonicalKey);
  });

  it('does not count ignored messages as link messages', () => {
    const summary = summarizeInboxMessages([
      { status: 'SUCCEEDED' },
      { status: 'DUPLICATE' },
      { status: 'IGNORED' },
      { status: 'IGNORED' },
      { status: 'PROCESSING' },
    ]);

    expect(summary.totalMessages).toBe(3);
    expect(summary.succeeded).toBe(1);
    expect(summary.duplicates).toBe(1);
    expect(summary.ignored).toBe(2);
  });

  it('uses the share text as a subject before video metadata is available', () => {
    expect(
      buildInboxSubject(
        '推荐这个内容给你看看 https://www.bilibili.com/video/BV1xx411c7mD',
        'bilibili',
      ),
    ).toBe('推荐这个内容给你看看');
  });
});
