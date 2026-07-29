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
    expect(markdown).not.toContain('```text');
    expect(markdown).toContain('第一行原文\n\n第二行原文');
  });

  it('uses a dedicated title for the raw transcript document', () => {
    expect(buildRawDocumentTitle('详细笔记')).toBe('原文：详细笔记');
  });

  it('records the Tencent ASR transcription provider', () => {
    const markdown = buildRawTranscriptMarkdown({
      duration: '12:34',
      generatedDate: '2026-07-29',
      sourceLabel: '录音文件',
      sourceUrl: '用户上传的本地文件',
      title: '项目交付复盘',
      transcript: '原始转录内容。',
      transcriptionProvider: 'tencent_asr',
      uploader: '本地文件',
    });

    expect(markdown).toContain('| 转录引擎 | 腾讯云 ASR 大模型 2.0 |');
  });

  it('formats continuous transcript text into readable paragraphs', () => {
    const markdown = buildRawTranscriptMarkdown({
      duration: '12:34',
      generatedDate: '2026-07-05',
      sourceLabel: 'B站视频',
      sourceUrl: 'https://www.bilibili.com/video/BV1xxxxxxx',
      title: '信息密度优化',
      transcript: '第一句话说明背景。第二句话说明方法！第三句话给出结论？',
      uploader: 'UP 主',
    });

    expect(markdown).not.toContain('```text');
    expect(markdown).toContain(
      '第一句话说明背景。\n\n第二句话说明方法！\n\n第三句话给出结论？',
    );
  });
});
