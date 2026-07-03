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
  /^<(?:title|callout)\b/u,
  /^<(?:whiteboard|sheet|task|chat_card|sub-page-list|cite|bookmark|button|time|figure)/u,
];

export function parseMarkdownDocument(markdown: string): ParsedArticleDocument {
  const normalizedMarkdown = markdown.replace(/\r\n/gu, '\n').trim();
  const lines = normalizedMarkdown.length
    ? normalizedMarkdown.split('\n')
    : [];
  const blocks: ArticleBlock[] = [];
  const unsupportedBlocks: string[] = [];
  let declaredTitle = '';

  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const titleMatch = trimmed.match(/^<title(?:\s[^>]*)?>([\s\S]*?)<\/title>$/u);
    if (titleMatch) {
      declaredTitle = stripXmlTags(titleMatch[1]).trim();
      index += 1;
      continue;
    }

    if (trimmed.startsWith('<callout')) {
      const callout = collectXmlContainer(lines, index, 'callout');
      const calloutMatch = callout.content.match(
        /^<callout(?:\s[^>]*)?>([\s\S]*?)<\/callout>$/u,
      );
      if (!calloutMatch) {
        unsupportedBlocks.push(callout.content.slice(0, 120));
        blocks.push({
          type: 'unsupported',
          raw: callout.content,
        });
        index = callout.nextIndex;
        continue;
      }
      blocks.push({
        type: 'quote',
        text: stripXmlTags(calloutMatch[1]).trim(),
      });
      index = callout.nextIndex;
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

  const title = declaredTitle || extractDocumentTitle(blocks) || '飞书文章导出';
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
  let paragraphIndex = 0;

  for (const block of normalizedBlocks) {
    if (block.type === 'heading') {
      if (block.level <= 2) {
        fragments.push(
          '<section style="margin:32px 0 16px;padding:0;">' +
            '<h2 style="margin:0;padding:0 0 0 13px;border-left:4px solid #d97706;' +
            'font-size:20px;line-height:1.45;font-weight:700;color:#1f2937;' +
            'letter-spacing:0.02em;">' +
            `${renderInlineHtml(block.text)}</h2></section>`,
        );
      } else {
        fragments.push(
          '<h3 style="margin:26px 0 12px;padding:0 0 8px;border-bottom:1px solid #f2dfbd;' +
            'font-size:17px;line-height:1.5;font-weight:700;color:#92400e;">' +
            `${renderInlineHtml(block.text)}</h3>`,
        );
      }
      continue;
    }

    if (block.type === 'paragraph') {
      const isLeadParagraph = paragraphIndex === 0 && options.style === 'editorial';
      fragments.push(
        `<p style="margin:0 0 18px;font-size:${isLeadParagraph ? '16px' : '15px'};` +
          `line-height:${isLeadParagraph ? '2' : '1.9'};color:${
            isLeadParagraph ? '#4b5563' : '#374151'
          };letter-spacing:0.035em;text-align:justify;">${renderInlineHtml(
            block.text,
          )}</p>`,
      );
      paragraphIndex += 1;
      continue;
    }

    if (block.type === 'quote') {
      fragments.push(
        '<blockquote style="margin:22px 0;padding:16px 18px;border:none;border-left:4px solid #f59e0b;' +
          'background:#fffbeb;color:#78350f;font-size:14px;line-height:1.85;' +
          `letter-spacing:0.03em;">${renderInlineHtml(block.text)}</blockquote>`,
      );
      continue;
    }

    if (block.type === 'code') {
      const languageLabel = block.language ? ` · ${escapeHtml(block.language)}` : '';
      fragments.push(
        '<section style="margin:22px 0;">' +
          `<p style="margin:0 0 7px;font-size:12px;color:#9ca3af;">代码块${languageLabel}</p>` +
          '<pre style="margin:0;overflow:auto;padding:17px 18px;border-radius:8px;' +
          'background:#111827;color:#f3f4f6;line-height:1.75;font-size:13px;' +
          `white-space:pre-wrap;"><code>${escapeHtml(
            block.code,
          )}</code></pre>` +
          '</section>',
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
        `<${tagName} style="margin:0 0 20px 22px;padding:0;color:#374151;` +
          `font-size:15px;line-height:1.85;">${listItems}</${tagName}>`,
      );
      continue;
    }

    if (block.type === 'image') {
      if (!options.includeImages) continue;
      fragments.push(
        '<figure style="margin:24px 0;text-align:center;">' +
          `<img src="${escapeAttribute(block.url)}" alt="${escapeAttribute(
            block.alt,
          )}" style="display:block;width:100%;max-width:100%;height:auto;margin:0 auto;` +
          `border-radius:6px;" />` +
          (block.alt
            ? `<figcaption style="margin-top:9px;font-size:12px;line-height:1.6;color:#9ca3af;">${escapeHtml(
                block.alt,
              )}</figcaption>`
            : '') +
          `</figure>`,
      );
      continue;
    }

    if (block.type === 'divider') {
      fragments.push(
        '<p style="margin:30px auto;text-align:center;color:#d1a35b;font-size:14px;' +
          'letter-spacing:0.55em;">• • •</p>',
      );
      continue;
    }

    if (block.type === 'table') {
      fragments.push(renderTableHtml(block.rows));
      continue;
    }

    if (block.type === 'unsupported') {
      fragments.push(
        `<div style="margin:20px 0;padding:13px 15px;border:1px solid #fcd34d;` +
          `background:#fffbeb;color:#92400e;font-size:13px;line-height:1.7;">${escapeHtml(
          block.raw,
        )}</div>`,
      );
    }
  }

  return [
    '<section data-wechat-article="true" style="margin:0 auto;padding:4px 2px;',
    'max-width:677px;font-family:Optima-Regular,PingFangTC-light,',
    'PingFangSC-light,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;',
    'color:#374151;word-break:break-word;">',
    fragments.join(''),
    '</section>',
  ].join('');
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
        `<th style="padding:10px 12px;border:1px solid #eadfcf;text-align:left;` +
        `background:#fff7e6;color:#78350f;font-weight:700;">${renderInlineHtml(
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
              `<td style="padding:10px 12px;border:1px solid #eadfcf;vertical-align:top;` +
              `color:#374151;background:#ffffff;">${renderInlineHtml(
                cell,
              )}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return [
    '<section style="margin:22px 0;overflow:auto;">',
    '<table style="width:100%;border-collapse:collapse;font-size:13px;line-height:1.7;">',
    `<thead><tr>${headerCells}</tr></thead>`,
    bodyHtml ? `<tbody>${bodyHtml}</tbody>` : '',
    '</table>',
    '</section>',
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

function stripXmlTags(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ');
}

function collectXmlContainer(
  lines: string[],
  startIndex: number,
  tagName: string,
): { content: string; nextIndex: number } {
  const closingTag = `</${tagName}>`;
  const collectedLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index].trim();
    collectedLines.push(line);
    index += 1;
    if (line.includes(closingTag)) break;
  }

  return {
    content: collectedLines.join('\n'),
    nextIndex: index,
  };
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
  return cells.every((cell) => /^:?-+:?$/u.test(cell));
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
