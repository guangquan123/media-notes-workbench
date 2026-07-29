import {
  buildDocumentRawMarkdown,
  getDocumentMimeType,
  isPlainTextDocumentFile,
  isSupportedDocumentFile,
  normalizePlainTextDocumentContent,
} from '../../server/modules/note-jobs/document-note.utils';

describe('document note utilities', () => {
  it('recognizes PDF, Word, and PowerPoint files by extension', () => {
    expect(isSupportedDocumentFile('research.pdf')).toBe(true);
    expect(isSupportedDocumentFile('meeting.docx')).toBe(true);
    expect(isSupportedDocumentFile('training.pptx')).toBe(true);
    expect(isSupportedDocumentFile('recording.mp3')).toBe(false);
  });

  it.each(['notes.txt', 'outline.md', 'handbook.markdown'])(
    'recognizes %s as a supported text document',
    (fileName: string) => {
      expect(isSupportedDocumentFile(fileName)).toBe(true);
      expect(isPlainTextDocumentFile(fileName)).toBe(true);
    },
  );

  it('normalizes supported document mime types from their file names', () => {
    expect(getDocumentMimeType('research.pdf')).toBe('application/pdf');
    expect(getDocumentMimeType('meeting.doc')).toBe('application/msword');
    expect(getDocumentMimeType('training.pptx')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(getDocumentMimeType('outline.md')).toBe('text/markdown');
    expect(getDocumentMimeType('notes.txt')).toBe('text/plain');
  });

  it('keeps Markdown text readable without sending it to a binary parser', () => {
    expect(
      normalizePlainTextDocumentContent('\uFEFF# 项目复盘\r\n\r\n- 明确范围\r\n'),
    ).toBe('# 项目复盘\n\n- 明确范围');
  });

  it('rejects an empty plain-text document', () => {
    expect(() => normalizePlainTextDocumentContent(' \n\t ')).toThrow(
      '文本文档没有可用内容',
    );
  });

  it('keeps every source file identifiable in a fused raw archive', () => {
    const markdown = buildDocumentRawMarkdown({
      generatedDate: '2026/07/15',
      items: [
        {
          content: '# 第一章\n\n数据标准定义',
          fileHash: 'hash-one',
          fileName: '第一章.pptx',
          parseQuality: 'parsed',
          sourceUrl: 'https://storage.example.com/first.pptx',
        },
        {
          content: '# 配套讲义\n\n字段口径',
          fileHash: 'hash-two',
          fileName: '讲义.docx',
          parseQuality: 'parsed',
          sourceUrl: 'https://storage.example.com/guide.docx',
        },
      ],
    });

    expect(markdown).toContain('## 来源 1：第一章.pptx');
    expect(markdown).toContain('## 来源 2：讲义.docx');
    expect(markdown).toContain('| 文件指纹 | hash-two |');
  });
});
