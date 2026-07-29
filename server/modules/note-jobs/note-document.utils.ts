interface BuildRawTranscriptMarkdownInput {
  duration: string;
  generatedDate: string;
  sourceLabel: string;
  sourceUrl: string;
  title: string;
  transcript: string;
  transcriptionProvider?: 'tencent_asr' | 'local_whisper' | 'mixed';
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
    `| 转录引擎 | ${formatTranscriptionProvider(input.transcriptionProvider)} |`,
    `| 整理日期 | ${input.generatedDate} |`,
    '',
    '## 完整转录',
    '',
    transcript,
    '',
  ].join('\n');
}

function formatTranscriptionProvider(
  provider: BuildRawTranscriptMarkdownInput['transcriptionProvider'],
): string {
  if (provider === 'tencent_asr') return '腾讯云 ASR 大模型 2.0';
  if (provider === 'mixed') return '腾讯云 ASR + 本地 Whisper（部分兜底）';
  if (provider === 'local_whisper') return '本地 Whisper（故障兜底）';
  return '未记录';
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
