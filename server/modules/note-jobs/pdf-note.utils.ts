interface PdfSourceMetadata {
  fileHash: string;
  fileName: string;
  generatedDate: string;
  parseQuality: 'parsed' | 'needs_ocr' | 'needs_review';
  sourceUrl: string;
}

export function buildPdfRawMarkdown(
  input: PdfSourceMetadata & { content: string },
): string {
  return [
    '# PDF 原文档案',
    '',
    '> 本文档保留 PDF 解析原文，供学习笔记中的观点回溯与人工核对。',
    '',
    '## 基本信息',
    '',
    '| 维度 | 内容 |',
    '| --- | --- |',
    `| 原始文件 | ${input.fileName} |`,
    `| 文件指纹 | ${input.fileHash} |`,
    `| 解析质量 | ${getParseQualityLabel(input.parseQuality)} |`,
    `| 原文件地址 | ${input.sourceUrl} |`,
    `| 整理日期 | ${input.generatedDate} |`,
    '',
    '## 解析原文',
    '',
    input.content.trim(),
    '',
  ].join('\n');
}

export function getParseQuality(
  content: string,
): PdfSourceMetadata['parseQuality'] {
  const normalized: string = content.replace(/\s+/gu, ' ').trim();
  if (normalized.length < 300) return 'needs_ocr';
  const replacementCount: number = (normalized.match(/[�□]/gu) || []).length;
  if (replacementCount > Math.max(3, normalized.length * 0.01)) {
    return 'needs_review';
  }
  return 'parsed';
}

function getParseQualityLabel(
  quality: PdfSourceMetadata['parseQuality'],
): string {
  if (quality === 'parsed') return '文本解析完成';
  if (quality === 'needs_ocr') return '文本较少，建议 OCR 或人工核对';
  return '检测到可能乱码，建议人工核对';
}
