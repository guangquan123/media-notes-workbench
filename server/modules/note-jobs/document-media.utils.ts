export type DocumentMediaSource =
  | { kind: 'data-url'; value: string }
  | { kind: 'file'; path: string }
  | { kind: 'remote-url'; url: string };

export interface DocumentMediaAsset {
  anchor: string;
  caption: string;
  source: DocumentMediaSource;
}

export interface DocumentDraft {
  markdown: string;
  media: DocumentMediaAsset[];
}

export interface CreatedLarkDocument {
  documentId: string;
  url: string;
}

export function buildDocumentMediaInsertCommand(input: {
  anchor: string;
  caption: string;
  documentId: string;
  fileName: string;
}): string[] {
  return [
    'docs',
    '+media-insert',
    '--as',
    'user',
    '--doc',
    input.documentId,
    '--file',
    input.fileName,
    '--selection-with-ellipsis',
    input.anchor,
    '--caption',
    input.caption,
    '--align',
    'center',
    '--format',
    'json',
  ];
}

export function buildDocumentFetchCommand(documentId: string): string[] {
  return [
    'docs',
    '+fetch',
    '--as',
    'user',
    '--doc',
    documentId,
    '--scope',
    'full',
    '--detail',
    'full',
    '--doc-format',
    'xml',
    '--format',
    'json',
  ];
}

export function parseCreatedLarkDocument(stdout: string): CreatedLarkDocument {
  const parsed = parseJsonEnvelope(stdout);
  const document = getRecord(getRecord(parsed.data).document);
  const url = getNonEmptyString(document.url);
  const documentId =
    getNonEmptyString(document.document_id) ||
    getNonEmptyString(document.documentId) ||
    getNonEmptyString(document.id) ||
    extractDocumentId(url);
  if (parsed.ok !== true || !url || !documentId) {
    throw new Error(getEnvelopeError(parsed) || '飞书文档创建失败');
  }
  return { documentId, url };
}

export function assertMediaInsertSucceeded(stdout: string): void {
  const parsed = parseJsonEnvelope(stdout);
  if (parsed.ok !== true) {
    throw new Error(getEnvelopeError(parsed) || '飞书文档图片插入失败');
  }
}

export function countDocumentImageBlocks(stdout: string): number {
  const parsed = parseJsonEnvelope(stdout);
  if (parsed.ok !== true) {
    throw new Error(getEnvelopeError(parsed) || '飞书文档回读失败');
  }
  const content = getNonEmptyString(
    getRecord(getRecord(parsed.data).document).content,
  );
  if (!content) throw new Error('飞书文档回读未返回正文');
  return [...content.matchAll(/<img(?:\s|>)/gu)].length;
}

export function assertDocumentImageAcceptance(
  stdout: string,
  expectedImageCount: number,
): number {
  const actualImageCount = countDocumentImageBlocks(stdout);
  if (actualImageCount < expectedImageCount) {
    throw new Error(
      `飞书文档图片块验收失败：预期至少 ${expectedImageCount} 张，实际 ${actualImageCount} 张`,
    );
  }
  return actualImageCount;
}

function extractDocumentId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /\/docx\/([^/?#]+)/u.exec(url)?.[1];
}

function getEnvelopeError(value: Record<string, unknown>): string | undefined {
  const error = getRecord(value.error);
  return getNonEmptyString(error.hint) || getNonEmptyString(error.message);
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonEnvelope(stdout: string): Record<string, unknown> {
  const candidates = [stdout.trim()];
  for (
    let index = stdout.lastIndexOf('\n{');
    index >= 0;
    index = stdout.lastIndexOf('\n{', index - 1)
  ) {
    candidates.push(stdout.slice(index + 1).trim());
  }
  for (const candidate of candidates) {
    try {
      const parsed = getRecord(JSON.parse(candidate));
      if (Object.keys(parsed).length > 0) return parsed;
    } catch {
      // lark-cli +media-insert may print progress lines before its JSON envelope.
    }
  }
  throw new Error('飞书命令未返回有效 JSON');
}
