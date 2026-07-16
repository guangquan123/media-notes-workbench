interface BuildRawTranscriptMarkdownInput {
  duration: string;
  generatedDate: string;
  sourceLabel: string;
  sourceUrl: string;
  title: string;
  transcript: string;
  uploader: string;
}

export function buildRawDocumentTitle(title: string): string {
  return `原文：${title}`.slice(0, 120);
}

export function buildRawTranscriptMarkdown(
  input: BuildRawTranscriptMarkdownInput,
): string {
  const transcript = formatTranscriptForReading(input.transcript);
  return [
    '# 原始转录稿',
    '',
    '> 这份文档保留完整原文，便于核对、复制和下载。',
    '',
    '## 基本信息',
    '',
    '| 维度 | 内容 |',
    '| --- | --- |',
    `| 标题 | ${input.title} |`,
    `| 来源平台 | ${input.sourceLabel} |`,
    `| 作者 | ${input.uploader} |`,
    `| 时长 | ${input.duration} |`,
    `| 原链接 | ${input.sourceUrl} |`,
    `| 整理日期 | ${input.generatedDate} |`,
    '',
    '## 完整转录',
    '',
    transcript,
    '',
  ].join('\n');
}

function formatTranscriptForReading(transcript: string): string {
  const paragraphs: string[] = transcript
    .replace(/\r\n?/gu, '\n')
    .split(/\n+/u)
    .flatMap((line: string) => {
      const sentences: string[] =
        line.match(/[^。！？!?；;]+[。！？!?；;]?/gu) || [];
      return sentences
        .map((sentence: string) => sentence.trim())
        .filter((sentence: string) => Boolean(sentence));
    });
  return paragraphs.join('\n\n').trim();
}
