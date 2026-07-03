import type { ArticleExportStyle } from '@shared/api.interface';

type ArticleBlock =
  | HeadingBlock
  | ParagraphBlock
  | QuoteBlock
  | CodeBlock
  | ListBlock
  | ImageBlock
  | DividerBlock
  | TableBlock
  | UnsupportedBlock;

interface ParsedArticleDocument {
  title: string;
  blocks: ArticleBlock[];
  unsupportedBlocks: string[];
}

interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

interface ParagraphBlock {
  type: 'paragraph';
  text: string;
}

interface QuoteBlock {
  type: 'quote';
  text: string;
}

interface CodeBlock {
  type: 'code';
  language: string;
  code: string;
}

interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}

interface ImageBlock {
  type: 'image';
  alt: string;
  url: string;
}

interface DividerBlock {
  type: 'divider';
}

interface TableBlock {
  type: 'table';
  rows: string[][];
}

interface UnsupportedBlock {
  type: 'unsupported';
  raw: string;
}

interface RenderOptions {
  title: string;
  sourceUrl: string;
  includeImages: boolean;
  style: ArticleExportStyle;
}

interface PlainTextOptions {
  title: string;
  sourceUrl: string;
  includeImages: boolean;
  style: ArticleExportStyle;
}

const BLOCK_STARTERS = [
  /^#{1,6}\s+/u,
  /^>\s+/u,
  /^[-*+]\s+/u,
  /^\d+\.\s+/u,
  /^```/u,
  /^~~~+/u,
  /^!\[[^\]]*\]\([^)]+\)$/u,
  /^<(?:whiteboard|sheet|task|chat_card|sub-page-list|cite|bookmark|button|time|figure)/u,
];

export function parseMarkdownDocument(markdown: string): ParsedArticleDocument {
  const normalizedMarkdown = markdown.replace(/\r\n/gu, '\n').trim();
  const lines = normalizedMarkdown.length
    ? normalizedMarkdown.split('\n')
    : [];
  const blocks: ArticleBlock[] = [];
  const unsupportedBlocks: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/u);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    const fenceMatch = trimmed.match(/^(```|~~~+)(.*)$/u);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const language = fenceMatch[2].trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length) {
        const current = lines[index];
        if (current.trim().startsWith(fence)) {
          break;
        }
        codeLines.push(current);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n'),
      });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/u.test(trimmed)) {
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    if (isTableLine(trimmed) && isTableSeparatorLine(lines[index + 1] ?? '')) {
      const tableRows: string[][] = [];
      let tableIndex = index;
      while (tableIndex < lines.length && isTableLine(lines[tableIndex].trim())) {
        const row = splitTableRow(lines[tableIndex]);
        if (row.length) {
          tableRows.push(row);
        }
        tableIndex += 1;
      }
      if (tableRows.length > 1) {
        blocks.push({
          type: 'table',
          rows: tableRows,
        });
        index = tableIndex;
        continue;
      }
    }

    const quoteLines: string[] = [];
    if (trimmed.startsWith('> ')) {
      let quoteIndex = index;
      while (quoteIndex < lines.length && lines[quoteIndex].trim().startsWith('>')) {
        quoteLines.push(lines[quoteIndex].trim().replace(/^>\s?/u, ''));
        quoteIndex += 1;
      }
      blocks.push({
        type: 'quote',
        text: quoteLines.join(' '),
      });
      index = quoteIndex;
      continue;
    }

    const listMatch = trimmed.match(/^(\d+\.|[-*+])\s+(.+)$/u);
    if (listMatch) {
      const ordered = /\d+\./u.test(listMatch[1]);
      const items: string[] = [];
      let listIndex = index;
      while (listIndex < lines.length) {
        const current = lines[listIndex].trim();
        const currentMatch = current.match(/^(\d+\.|[-*+])\s+(.+)$/u);
        if (!currentMatch) {
          break;
        }
        items.push(currentMatch[2].trim());
        listIndex += 1;
      }
      blocks.push({
        type: 'list',
        ordered,
        items,
      });
      index = listIndex;
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/u);
    if (imageMatch) {
      blocks.push({
        type: 'image',
        alt: imageMatch[1].trim(),
        url: imageMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('<') && isUnsupportedXmlLikeBlock(trimmed)) {
      unsupportedBlocks.push(trimmed.slice(0, 120));
      blocks.push({
        type: 'unsupported',
        raw: trimmed,
      });
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [trimmed];
    let paragraphIndex = index + 1;
    while (
      paragraphIndex < lines.length &&
      lines[paragraphIndex].trim() &&
      !isBlockStarter(lines[paragraphIndex].trim()) &&
      !isTableSeparatorLine(lines[paragraphIndex].trim())
    ) {
      paragraphLines.push(lines[paragraphIndex].trim());
      paragraphIndex += 1;
    }
    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join(' '),
    });
    index = paragraphIndex;
  }

  const title = extractDocumentTitle(blocks) || '飞书文章导出';
  return {
    title,
    blocks,
    unsupportedBlocks,
  };
}

export function extractDocumentTitle(blocks: ArticleBlock[]): string | undefined {
  const firstHeading = blocks.find((block): block is HeadingBlock => block.type === 'heading');
  if (firstHeading) return firstHeading.text.trim();

  const firstParagraph = blocks.find(
    (block): block is ParagraphBlock => block.type === 'paragraph',
  );
  if (!firstParagraph) return undefined;

  const cleaned = stripMarkdownSyntax(firstParagraph.text).trim();
  return cleaned || undefined;
}

export function dropLeadingTitleBlock(
  blocks: ArticleBlock[],
  title: string,
): ArticleBlock[] {
  const firstBlock = blocks[0];
  if (!firstBlock || firstBlock.type !== 'heading') return blocks;
  if (normalizeText(firstBlock.text) !== normalizeText(title)) return blocks;
  return blocks.slice(1);
}

export function renderArticlePreviewHtml(
  blocks: ArticleBlock[],
  options: RenderOptions,
): string {
  const bodyHtml = renderBlocksToHtml(blocks, options);
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;',
    'max-width:760px;margin:0 auto;color:#1d1d1f;line-height:1.78;">',
    `<div style="padding:24px 0 12px;border-bottom:1px solid rgba(0,0,0,0.08);margin-bottom:20px;">`,
    `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">`,
    `<span style="display:inline-flex;align-items:center;border-radius:999px;background:rgba(244,114,31,0.10);color:#c2410c;padding:4px 10px;font-size:12px;font-weight:700;">${escapeHtml(options.style === 'concise' ? '简洁稿' : '编辑稿')}</span>`,
    `<span style="color:rgba(0,0,0,0.48);font-size:12px;">来源：${escapeHtml(options.sourceUrl)}</span>`,
    `</div>`,
    `<h1 style="margin:0;font-size:32px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;">${escapeHtml(options.title)}</h1>`,
    `</div>`,
    bodyHtml,
    '</div>',
  ].join('');
}

export function renderBlocksToHtml(
  blocks: ArticleBlock[],
  options: RenderOptions,
): string {
  const normalizedBlocks = dropLeadingTitleBlock(blocks, options.title);
  const fragments: string[] = [];

  for (const block of normalizedBlocks) {
    if (block.type === 'heading') {
      const level = block.level;
      const sizeMap: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
        1: '28px',
        2: '24px',
        3: '20px',
        4: '18px',
        5: '16px',
        6: '15px',
      };
      fragments.push(
        `<h${level} style="font-size:${sizeMap[level]};line-height:1.35;font-weight:700;margin:28px 0 12px;">${renderInlineHtml(
          block.text,
        )}</h${level}>`,
      );
      continue;
    }

    if (block.type === 'paragraph') {
      fragments.push(
        `<p style="margin:0 0 16px;">${renderInlineHtml(block.text)}</p>`,
      );
      continue;
    }

    if (block.type === 'quote') {
      fragments.push(
        `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:4px solid rgba(244,114,31,0.4);background:rgba(244,114,31,0.06);color:#444;">${renderInlineHtml(
          block.text,
        )}</blockquote>`,
      );
      continue;
    }

    if (block.type === 'code') {
      const languageLabel = block.language ? ` · ${escapeHtml(block.language)}` : '';
      fragments.push(
        `<div style="margin:0 0 16px;">` +
          `<div style="font-size:12px;color:rgba(0,0,0,0.42);margin-bottom:6px;">代码块${languageLabel}</div>` +
          `<pre style="overflow:auto;padding:16px;border-radius:14px;background:#111827;color:#f3f4f6;line-height:1.7;font-size:13px;"><code>${escapeHtml(
            block.code,
          )}</code></pre>` +
          `</div>`,
      );
      continue;
    }

    if (block.type === 'list') {
      const tagName = block.ordered ? 'ol' : 'ul';
      const listItems = block.items
        .map(
          (item) =>
            `<li style="margin:6px 0;">${renderInlineHtml(item)}</li>`,
        )
        .join('');
      fragments.push(
        `<${tagName} style="margin:0 0 16px 22px;padding:0;">${listItems}</${tagName}>`,
      );
      continue;
    }

    if (block.type === 'image') {
      if (!options.includeImages) continue;
      fragments.push(
        `<figure style="margin:0 0 20px;">` +
          `<img src="${escapeAttribute(block.url)}" alt="${escapeAttribute(
            block.alt,
          )}" style="max-width:100%;border-radius:16px;display:block;" />` +
          (block.alt
            ? `<figcaption style="margin-top:8px;font-size:12px;color:rgba(0,0,0,0.42);">${escapeHtml(
                block.alt,
              )}</figcaption>`
            : '') +
          `</figure>`,
      );
      continue;
    }

    if (block.type === 'divider') {
      fragments.push(
        '<hr style="border:none;border-top:1px solid rgba(0,0,0,0.10);margin:24px 0;" />',
      );
      continue;
    }

    if (block.type === 'table') {
      fragments.push(renderTableHtml(block.rows));
      continue;
    }

    if (block.type === 'unsupported') {
      fragments.push(
        `<div style="margin:0 0 16px;padding:12px 14px;border-radius:14px;background:rgba(239,68,68,0.06);color:#991b1b;font-size:13px;">${escapeHtml(
          block.raw,
        )}</div>`,
      );
    }
  }

  if (options.style === 'concise') {
    return `<div style="font-size:15px;">${fragments.join('')}</div>`;
  }

  return `<div style="font-size:16px;">${fragments.join('')}</div>`;
}

export function renderBlocksToMarkdown(
  blocks: ArticleBlock[],
  options: PlainTextOptions,
): string {
  const normalizedBlocks = dropLeadingTitleBlock(blocks, options.title);
  const lines: string[] = [`# ${options.title}`, '', `来源：${options.sourceUrl}`, ''];

  for (const block of normalizedBlocks) {
    if (block.type === 'heading') {
      lines.push(`${'#'.repeat(block.level)} ${block.text}`);
      lines.push('');
      continue;
    }

    if (block.type === 'paragraph') {
      lines.push(block.text);
      lines.push('');
      continue;
    }

    if (block.type === 'quote') {
      lines.push(...block.text.split('\n').map((line) => `> ${line}`));
      lines.push('');
      continue;
    }

    if (block.type === 'code') {
      const language = block.language ? block.language : '';
      lines.push(`\`\`\`${language}`.trimEnd());
      lines.push(block.code);
      lines.push('```');
      lines.push('');
      continue;
    }

    if (block.type === 'list') {
      block.items.forEach((item, itemIndex) => {
        const prefix = block.ordered ? `${itemIndex + 1}.` : '-';
        lines.push(`${prefix} ${item}`);
      });
      lines.push('');
      continue;
    }

    if (block.type === 'image') {
      if (options.includeImages) {
        lines.push(`![${block.alt}](${block.url})`);
        lines.push('');
      }
      continue;
    }

    if (block.type === 'divider') {
      lines.push('---');
      lines.push('');
      continue;
    }

    if (block.type === 'table') {
      lines.push(renderTableMarkdown(block.rows));
      lines.push('');
      continue;
    }

    if (block.type === 'unsupported') {
      lines.push(`> [不支持的块] ${block.raw}`);
      lines.push('');
    }
  }

  return lines.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

export function renderBlocksToPlainText(
  blocks: ArticleBlock[],
  options: PlainTextOptions,
): string {
  const normalizedBlocks = dropLeadingTitleBlock(blocks, options.title);
  const lines: string[] = [options.title, `来源：${options.sourceUrl}`, ''];

  for (const block of normalizedBlocks) {
    if (block.type === 'heading') {
      lines.push(block.text.toUpperCase());
      lines.push('');
      continue;
    }

    if (block.type === 'paragraph') {
      lines.push(stripMarkdownSyntax(block.text));
      lines.push('');
      continue;
    }

    if (block.type === 'quote') {
      lines.push(`「${stripMarkdownSyntax(block.text)}」`);
      lines.push('');
      continue;
    }

    if (block.type === 'code') {
      lines.push(`[代码 ${block.language || 'plain'}] ${stripMarkdownSyntax(block.code)}`);
      lines.push('');
      continue;
    }

    if (block.type === 'list') {
      block.items.forEach((item, itemIndex) => {
        const prefix = block.ordered ? `${itemIndex + 1}.` : '•';
        lines.push(`${prefix} ${stripMarkdownSyntax(item)}`);
      });
      lines.push('');
      continue;
    }

    if (block.type === 'image') {
      if (options.includeImages) {
        lines.push(`[图片] ${block.alt || block.url}`);
        lines.push('');
      }
      continue;
    }

    if (block.type === 'divider') {
      lines.push('——');
      lines.push('');
      continue;
    }

    if (block.type === 'table') {
      lines.push(renderTablePlainText(block.rows));
      lines.push('');
      continue;
    }

    if (block.type === 'unsupported') {
      lines.push(`[不支持的块] ${block.raw}`);
      lines.push('');
    }
  }

  return lines.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

export function buildDouyinCopy(
  blocks: ArticleBlock[],
  options: PlainTextOptions,
): string {
  const normalizedBlocks = dropLeadingTitleBlock(blocks, options.title);
  const highlightLines: string[] = [];
  const keyPoints: string[] = [];

  for (const block of normalizedBlocks) {
    if (highlightLines.length < 2 && block.type === 'paragraph') {
      const text = stripMarkdownSyntax(block.text);
      if (text) highlightLines.push(text);
      continue;
    }

    if (block.type === 'heading' && keyPoints.length < 3) {
      keyPoints.push(block.text);
      continue;
    }

    if (block.type === 'list') {
      for (const item of block.items) {
        if (keyPoints.length >= 5) break;
        keyPoints.push(stripMarkdownSyntax(item));
      }
    }
  }

  if (!highlightLines.length) {
    highlightLines.push('这篇内容适合快速转述成短视频口播稿。');
  }

  const leadLines = options.style === 'concise'
    ? highlightLines.slice(0, 1)
    : highlightLines.slice(0, 2);

  const bodyLines = keyPoints.length
    ? keyPoints.slice(0, options.style === 'concise' ? 3 : 5)
    : extractFallbackPoints(normalizedBlocks, options.style);

  const footer =
    options.style === 'concise'
      ? '建议配图：使用首图 + 2 到 3 个要点。'
      : '建议配图：封面图突出结论，正文页配 3 到 5 个要点。';

  return [
    options.title,
    '',
    ...leadLines,
    '',
    '要点：',
    ...bodyLines.map((line) => `- ${line}`),
    '',
    footer,
  ]
    .join('\n')
    .trim();
}

export function buildUnsupportedSummary(
  blocks: ArticleBlock[],
  includeImages: boolean,
): string[] {
  const summary = new Set<string>();
  for (const block of blocks) {
    if (block.type === 'unsupported') {
      summary.add(stripMarkdownSyntax(block.raw).slice(0, 80));
    }
    if (block.type === 'image' && !includeImages) {
      summary.add('图片按当前设置未导出');
    }
  }
  return Array.from(summary);
}

function extractFallbackPoints(
  blocks: ArticleBlock[],
  style: ArticleExportStyle,
): string[] {
  const points: string[] = [];
  for (const block of blocks) {
    if (block.type === 'heading') {
      points.push(block.text);
    } else if (block.type === 'paragraph') {
      const text = stripMarkdownSyntax(block.text);
      if (text.length > 20) points.push(text);
    } else if (block.type === 'table') {
      const firstRow = block.rows[0];
      if (firstRow && firstRow.length) points.push(firstRow.join(' / '));
    }
    if (points.length >= (style === 'concise' ? 3 : 5)) break;
  }
  if (!points.length) {
    points.push('可从完整文档中挑选 3 个核心观点展开。');
  }
  return points;
}

function renderTableHtml(rows: string[][]): string {
  if (!rows.length) return '';
  const headerRow = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const headerCells = headerRow
    .map(
      (cell) =>
        `<th style="padding:10px 12px;border:1px solid rgba(0,0,0,0.08);text-align:left;background:#fafafa;">${renderInlineHtml(
          cell,
        )}</th>`,
    )
    .join('');
  const bodyHtml = bodyRows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell) =>
              `<td style="padding:10px 12px;border:1px solid rgba(0,0,0,0.08);vertical-align:top;">${renderInlineHtml(
                cell,
              )}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return [
    '<div style="margin:0 0 16px;overflow:auto;">',
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">',
    `<thead><tr>${headerCells}</tr></thead>`,
    bodyHtml ? `<tbody>${bodyHtml}</tbody>` : '',
    '</table>',
    '</div>',
  ].join('');
}

function renderTableMarkdown(rows: string[][]): string {
  if (!rows.length) return '';
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const separator = header.map(() => '---');
  const markdownRows = [header, separator, ...body];
  return markdownRows
    .map((row) => `| ${row.map((cell) => escapePipe(cell)).join(' | ')} |`)
    .join('\n');
}

function renderTablePlainText(rows: string[][]): string {
  if (!rows.length) return '';
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const output: string[] = [];
  if (header.length) {
    output.push(`表头：${header.map((cell) => stripMarkdownSyntax(cell)).join(' / ')}`);
  }
  for (const row of body) {
    output.push(`- ${row.map((cell) => stripMarkdownSyntax(cell)).join(' / ')}`);
  }
  return output.join('\n');
}

function renderInlineHtml(raw: string): string {
  let value = escapeHtml(raw);
  value = value.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/gu,
    (_match, altText: string, url: string) =>
      `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(altText)}" style="max-width:100%;border-radius:12px;vertical-align:middle;" />`,
  );
  value = value.replace(
    /\[([^\]]+)\]\(([^)]+)\)/gu,
    (_match, text: string, url: string) =>
      `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer" style="color:#c2410c;text-decoration:underline;">${text}</a>`,
  );
  value = value.replace(/`([^`]+)`/gu, '<code style="padding:0 4px;border-radius:4px;background:rgba(0,0,0,0.06);font-size:0.92em;">$1</code>');
  value = value.replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
  value = value.replace(/\*([^*]+)\*/gu, '<em>$1</em>');
  value = value.replace(/~~([^~]+)~~/gu, '<del>$1</del>');
  value = value.replace(/\n/gu, '<br/>');
  return value;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function escapeAttribute(raw: string): string {
  return escapeHtml(raw).replace(/\n/gu, ' ');
}

function escapePipe(raw: string): string {
  return stripMarkdownSyntax(raw).replace(/\|/gu, '\\|');
}

function stripMarkdownSyntax(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/gu, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/\*([^*]+)\*/gu, '$1')
    .replace(/~~([^~]+)~~/gu, '$1')
    .replace(/^>\s?/gmu, '')
    .trim();
}

function normalizeText(raw: string): string {
  return stripMarkdownSyntax(raw)
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function isBlockStarter(line: string): boolean {
  return BLOCK_STARTERS.some((pattern) => pattern.test(line));
}

function isUnsupportedXmlLikeBlock(line: string): boolean {
  return /^(<whiteboard|<sheet|<task|<chat_card|<sub-page-list|<cite|<bookmark|<button|<time|<figure)/u.test(
    line,
  );
}

function isTableLine(line: string): boolean {
  return line.includes('|');
}

function isTableSeparatorLine(line: string): boolean {
  if (!line.includes('|')) return false;
  const cells = line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function splitTableRow(line: string): string[] {
  return line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell, cellIndex, cells) => {
      if (cells.length === 1) return true;
      if (cellIndex === 0 && cell === '') return false;
      if (cellIndex === cells.length - 1 && cell === '') return false;
      return true;
    });
}
