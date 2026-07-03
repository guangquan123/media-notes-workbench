import {
  parseMarkdownDocument,
  renderBlocksToHtml,
} from '../../server/modules/article-export/article-export.utils';

describe('article export WeChat renderer', () => {
  it('removes the article title and renders WeChat-compatible inline styles', () => {
    const parsed = parseMarkdownDocument([
      '# 一篇测试文章',
      '',
      '这是导语段落。',
      '',
      '## 第一部分',
      '',
      '> 一条关键引用。',
      '',
      '- 要点一',
      '- 要点二',
    ].join('\n'));

    const html = renderBlocksToHtml(parsed.blocks, {
      title: '一篇测试文章',
      sourceUrl: 'https://example.com/doc',
      includeImages: true,
      style: 'editorial',
    });

    expect(html).toContain('data-wechat-article="true"');
    expect(html).toContain('font-family:Optima-Regular');
    expect(html).toContain('<h2 style=');
    expect(html).toContain('border-left:4px solid #d97706');
    expect(html).toContain('<blockquote style=');
    expect(html).not.toContain('一篇测试文章');
    expect(html).not.toContain('<style');
  });

  it('keeps tables and responsive images in the generated HTML', () => {
    const parsed = parseMarkdownDocument([
      '# 标题',
      '',
      '| 名称 | 说明 |',
      '| --- | --- |',
      '| 微信 | 富文本 |',
      '',
      '![示意图](https://example.com/image.png)',
    ].join('\n'));

    const html = renderBlocksToHtml(parsed.blocks, {
      title: '标题',
      sourceUrl: 'https://example.com/doc',
      includeImages: true,
      style: 'concise',
    });

    expect(html).toContain('<table style=');
    expect(html).toContain('background:#fff7e6');
    expect(html).toContain('src="https://example.com/image.png"');
    expect(html).toContain('width:100%;max-width:100%;height:auto');
  });

  it('normalizes Lark title, callout, and compact table syntax', () => {
    const parsed = parseMarkdownDocument([
      '<title>飞书里的文章标题</title>',
      '',
      '<callout emoji="💡">',
      '这是飞书高亮内容。',
      '</callout>',
      '',
      '| 名称 | 说明 |',
      '|-|-|',
      '| 微信 | 富文本 |',
    ].join('\n'));

    expect(parsed.title).toBe('飞书里的文章标题');

    const html = renderBlocksToHtml(parsed.blocks, {
      title: parsed.title,
      sourceUrl: 'https://example.com/doc',
      includeImages: true,
      style: 'editorial',
    });

    expect(html).toContain('这是飞书高亮内容。');
    expect(html).toContain('<blockquote style=');
    expect(html).toContain('<table style=');
    expect(html).not.toContain('&lt;title&gt;');
    expect(html).not.toContain('&lt;callout');
  });
});
