export interface TranscriptQualityResult {
  requiresReview: boolean;
  warnings: string[];
}

const FILLER_RUN_PATTERN = /(?:[嗯呃啊哦唔诶]+[\s,，。！？、]*){8,}/gu;
const PHRASE_LENGTH = 4;
const REPETITION_THRESHOLD = 10;
const NO_TRANSCRIPT_QUALITY_WARNINGS = '未检测到转录质量风险。';

export function assessTranscriptQuality(
  transcript: string,
): TranscriptQualityResult {
  const normalized: string = transcript.replace(/\s+/gu, ' ').trim();
  const warnings: string[] = [];
  if (FILLER_RUN_PATTERN.test(normalized)) {
    warnings.push('检测到连续语气词，可能存在静音或识别异常');
  }
  if (hasExcessivelyRepeatedPhrase(normalized)) {
    warnings.push('检测到高频重复短语，可能存在转录重复或幻觉');
  }
  return { requiresReview: warnings.length > 0, warnings };
}

export function formatTranscriptQualityWarnings(warnings: string[]): string {
  return warnings.length > 0
    ? warnings.join('；')
    : NO_TRANSCRIPT_QUALITY_WARNINGS;
}

function hasExcessivelyRepeatedPhrase(text: string): boolean {
  const compact: string = text.replace(/[^\p{L}\p{N}]/gu, '');
  if (compact.length < PHRASE_LENGTH * REPETITION_THRESHOLD) return false;
  const counts = new Map<string, number>();
  for (let index = 0; index <= compact.length - PHRASE_LENGTH; index += 1) {
    const phrase: string = compact.slice(index, index + PHRASE_LENGTH);
    const count: number = (counts.get(phrase) || 0) + 1;
    if (count >= REPETITION_THRESHOLD) return true;
    counts.set(phrase, count);
  }
  return false;
}
