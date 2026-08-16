export type DocumentMediaSource =
  | { kind: 'data-url'; value: string }
  | { kind: 'file'; path: string }
  | { kind: 'remote-url'; url: string };

export interface DocumentMediaAsset {
  anchor: string;
  caption: string;
  optional?: boolean;
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

export interface DocumentImageType {
  contentType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'gif' | 'jpg' | 'png' | 'webp';
}

export interface PlatformStorageObject {
  appId: string;
  bucketId: string;
  filePath: string;
}

export interface DocumentMediaPublishResult {
  publishedCount: number;
  skippedOptional: Array<{
    anchor: string;
    message: string;
  }>;
}

export const MAX_DOCUMENT_IMAGE_BYTES = 20 * 1024 * 1024;
/**
 * The Feishu document tool rejects Markdown payloads above 10,000 characters.
 * Keep room for title and command-level metadata to avoid boundary failures.
 */
export const MAX_LARK_MARKDOWN_CHUNK_LENGTH = 9_000;

/**
 * Splits Markdown without dropping or reordering any characters. Paragraph and
 * line boundaries are preferred so each appended Lark document chunk remains
 * readable on its own; a long unbroken line falls back to a hard boundary.
 */
export function splitMarkdownForLark(
  markdown: string,
  maxLength = MAX_LARK_MARKDOWN_CHUNK_LENGTH,
): string[] {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) {
    throw new Error('飞书 Markdown 分段长度必须为正整数');
  }
  if (markdown.length <= maxLength) return [markdown];

  const chunks: string[] = [];
  let start = 0;
  while (start < markdown.length) {
    const end = Math.min(start + maxLength, markdown.length);
    if (end === markdown.length) {
      chunks.push(markdown.slice(start));
      break;
    }

    const paragraphBoundary = markdown.lastIndexOf('\n\n', end - 1);
    const lineBoundary = markdown.lastIndexOf('\n', end - 1);
    const boundary =
      paragraphBoundary >= start
        ? paragraphBoundary + 2
        : lineBoundary >= start
          ? lineBoundary + 1
          : end;
    chunks.push(markdown.slice(start, boundary));
    start = boundary;
  }
  return chunks;
}

export function parsePlatformStorageUrl(
  rawUrl: string,
): PlatformStorageObject | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.toLowerCase().endsWith('.aiforce.run')
  ) {
    return undefined;
  }
  const match =
    /^\/(?:spark\/app|app)\/([^/]+)\/runtime\/api\/v1\/storage\/object\/([^/]+)\/(.+)$/u.exec(
      url.pathname,
    );
  if (!match) return undefined;
  try {
    const filePath = decodeURIComponent(match[3]);
    if (
      !/^[a-z0-9_-]+$/iu.test(match[1]) ||
      !/^[a-z0-9_-]+$/iu.test(match[2]) ||
      !filePath ||
      filePath.startsWith('/') ||
      filePath.includes('\0') ||
      filePath.split('/').includes('..')
    ) {
      return undefined;
    }
    return {
      appId: match[1],
      bucketId: decodeURIComponent(match[2]),
      filePath,
    };
  } catch {
    return undefined;
  }
}

export function detectDocumentImageType(
  buffer: Uint8Array,
): DocumentImageType | undefined {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  const prefix = Buffer.from(buffer.subarray(0, 6)).toString('ascii');
  if (prefix === 'GIF87a' || prefix === 'GIF89a') {
    return { contentType: 'image/gif', extension: 'gif' };
  }
  if (
    buffer.length >= 12 &&
    Buffer.from(buffer.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(buffer.subarray(8, 12)).toString('ascii') === 'WEBP'
  ) {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  return undefined;
}

export async function publishDocumentMediaAssets(
  assets: readonly DocumentMediaAsset[],
  publishAsset: (asset: DocumentMediaAsset, index: number) => Promise<void>,
): Promise<DocumentMediaPublishResult> {
  const skippedOptional: DocumentMediaPublishResult['skippedOptional'] = [];
  let publishedCount = 0;
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    try {
      await publishAsset(asset, index);
      publishedCount += 1;
    } catch (error) {
      if (!asset.optional) throw error;
      skippedOptional.push({
        anchor: asset.anchor,
        message: error instanceof Error ? error.message : '未知错误',
      });
    }
  }
  return { publishedCount, skippedOptional };
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

export function buildDocumentAppendCommand(documentId: string): string[] {
  return [
    'docs',
    '+update',
    '--as',
    'user',
    '--doc',
    documentId,
    '--command',
    'append',
    '--doc-format',
    'markdown',
    '--content',
    '-',
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

export function assertLarkDocumentCommandSucceeded(stdout: string): void {
  const parsed = parseJsonEnvelope(stdout);
  if (parsed.ok !== true) {
    throw new Error(getEnvelopeError(parsed) || '飞书文档写入失败');
  }
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
