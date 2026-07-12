import {
  buildPdfRawMarkdown,
  getParseQuality,
} from '../../server/modules/note-jobs/pdf-note.utils';

describe('PDF note utilities', () => {
  it('marks short parsed content as needing OCR or human review', () => {
    expect(getParseQuality('扫描版')).toBe('needs_ocr');
  });

  it('keeps the source fingerprint and parse status in the raw archive', () => {
    const markdown = buildPdfRawMarkdown({
      content: '# 数据治理\n\n正文内容',
      fileHash: 'abc123',
      fileName: 'data-governance.pdf',
      generatedDate: '2026/07/12',
      parseQuality: 'parsed',
      sourceUrl: 'https://storage.example.com/data-governance.pdf',
    });

    expect(markdown).toContain('| 文件指纹 | abc123 |');
    expect(markdown).toContain('| 解析质量 | 文本解析完成 |');
    expect(markdown).toContain('# 数据治理');
  });
});
