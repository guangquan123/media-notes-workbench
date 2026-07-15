interface DocumentSourceMetadata {
  content: string;
  fileHash: string;
  fileName: string;
  parseQuality: 'parsed' | 'needs_ocr' | 'needs_review';
  sourceUrl: string;
}

interface DocumentRawArchiveInput {
  generatedDate: string;
  items: DocumentSourceMetadata[];
}

const DOCUMENT_MIME_TYPES: Record<string, string> = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function getDocumentExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function isSupportedDocumentFile(fileName: string): boolean {
  return getDocumentExtension(fileName) in DOCUMENT_MIME_TYPES;
}

function getDocumentMimeType(fileName: string): string | undefined {
  return DOCUMENT_MIME_TYPES[getDocumentExtension(fileName)];
}

function getParseQualityLabel(
  quality: DocumentSourceMetadata['parseQuality'],
): string {
  if (quality === 'parsed') return '文本解析完成';
  if (quality === 'needs_ocr') return '文本较少，建议 OCR 或人工核对';
  return '检测到可能乱码，建议人工核对';
}

function buildDocumentRawMarkdown(input: DocumentRawArchiveInput): string {
  const sections: string[] = input.items.map(
    (item: DocumentSourceMetadata, index: number): string =>
      [
        `## 来源 ${index + 1}：${item.fileName}`,
        '',
        '| 维度 | 内容 |',
        '| --- | --- |',
        `| 原始文件 | ${item.fileName} |`,
        `| 文件指纹 | ${item.fileHash} |`,
        `| 解析质量 | ${getParseQualityLabel(item.parseQuality)} |`,
        `| 原文件地址 | ${item.sourceUrl} |`,
        '',
        '### 解析原文',
        '',
        item.content.trim(),
      ].join('\n'),
  );
  return [
    '# 文档原文档案',
    '',
    '> 本文档按上传顺序保留各来源的解析原文，供学习笔记回溯与人工核对。',
    '',
    `整理日期：${input.generatedDate}`,
    '',
    ...sections,
    '',
  ].join('\n');
}

export {
  buildDocumentRawMarkdown,
  getDocumentMimeType,
  isSupportedDocumentFile,
};
