import {
  buildRawDocumentTitle,
  buildRawTranscriptMarkdown,
} from '../../server/modules/note-jobs/note-document.utils';

describe('note document utilities', () => {
  it('builds a raw transcript document that preserves the original text', () => {
    const markdown = buildRawTranscriptMarkdown({
      duration: '12:34',
      generatedDate: '2026-07-05',
      sourceLabel: 'B站视频',
      sourceUrl: 'https://www.bilibili.com/video/BV1xxxxxxx',
      title: '信息密度优化',
      transcript: '第一行原文\n第二行原文',
      uploader: 'UP 主',
    });

    expect(markdown).toContain('# 原始转录稿');
    expect(markdown).toContain('| 标题 | 信息密度优化 |');
    expect(markdown).toContain('```text');
    expect(markdown).toContain('第一行原文\n第二行原文');
  });

  it('uses a dedicated title for the raw transcript document', () => {
    expect(buildRawDocumentTitle('详细笔记')).toBe('原文：详细笔记');
  });
});
