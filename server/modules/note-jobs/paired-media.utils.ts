import type { PairedMediaAlignmentResult } from '@shared/api.interface';

export interface TranscriptSegment {
  endMs: number;
  startMs: number;
  text: string;
}

export interface FusedTranscriptResult {
  conflictCount: number;
  corroboratedCount: number;
  markdown: string;
  singleSourceCount: number;
}

interface FuseTranscriptInput {
  audioOffsetMs: number;
  auxiliarySegments: TranscriptSegment[];
  videoSegments: TranscriptSegment[];
}

interface WhisperSegment {
  offsets?: {
    from?: number | string;
    to?: number | string;
  };
  text?: string;
  timestamps?: {
    from?: string;
    to?: string;
  };
}

interface WhisperJson {
  transcription?: WhisperSegment[];
}

const ALIGNMENT_SCORE_THRESHOLD = 0.35;
const TRANSCRIPT_SIMILARITY_THRESHOLD = 0.65;

export function buildEnergyEnvelope(
  samples: Int16Array,
  sampleRate: number,
  bucketMs: number,
): number[] {
  const bucketSize: number = Math.max(
    1,
    Math.round((sampleRate * bucketMs) / 1_000),
  );
  const envelope: number[] = [];
  for (let offset = 0; offset < samples.length; offset += bucketSize) {
    const end: number = Math.min(samples.length, offset + bucketSize);
    let energy = 0;
    for (let index = offset; index < end; index += 1) {
      const normalized: number = samples[index] / 32_768;
      energy += normalized * normalized;
    }
    envelope.push(Math.sqrt(energy / Math.max(1, end - offset)));
  }
  return envelope;
}

export function estimateAudioAlignment(
  videoEnvelope: number[],
  auxiliaryEnvelope: number[],
  bucketMs: number,
  maxOffsetMs: number,
): PairedMediaAlignmentResult {
  if (
    videoEnvelope.length < 4 ||
    auxiliaryEnvelope.length < 4 ||
    bucketMs <= 0
  ) {
    return {
      audioOffsetMs: 0,
      score: 0,
      status: 'needs_review',
    };
  }
  const maxOffsetBuckets: number = Math.max(
    0,
    Math.round(maxOffsetMs / bucketMs),
  );
  const minimumOverlap: number = Math.max(
    4,
    Math.floor(Math.min(videoEnvelope.length, auxiliaryEnvelope.length) * 0.6),
  );
  let bestOffset = 0;
  let bestScore = -1;
  let bestOverlap = 0;
  const minimumOffset: number = -Math.min(
    maxOffsetBuckets,
    auxiliaryEnvelope.length - minimumOverlap,
  );
  const maximumOffset: number = Math.min(
    maxOffsetBuckets,
    videoEnvelope.length - minimumOverlap,
  );

  for (
    let candidateOffset = minimumOffset;
    candidateOffset <= maximumOffset;
    candidateOffset += 1
  ) {
    const videoStart: number = Math.max(0, candidateOffset);
    const auxiliaryStart: number = Math.max(0, -candidateOffset);
    const overlap: number = Math.min(
      videoEnvelope.length - videoStart,
      auxiliaryEnvelope.length - auxiliaryStart,
    );
    if (overlap < minimumOverlap) continue;
    const score: number = calculateCorrelation(
      videoEnvelope,
      videoStart,
      auxiliaryEnvelope,
      auxiliaryStart,
      overlap,
    );
    if (
      score > bestScore ||
      (score === bestScore && overlap > bestOverlap) ||
      (score === bestScore &&
        overlap === bestOverlap &&
        Math.abs(candidateOffset) < Math.abs(bestOffset))
    ) {
      bestOffset = candidateOffset;
      bestScore = score;
      bestOverlap = overlap;
    }
  }

  const normalizedScore: number = Math.max(0, bestScore);
  return {
    audioOffsetMs: bestOffset * bucketMs,
    score: Number(normalizedScore.toFixed(3)),
    status:
      normalizedScore >= ALIGNMENT_SCORE_THRESHOLD
        ? 'aligned'
        : 'needs_review',
  };
}

export function parseWhisperJson(rawJson: string): TranscriptSegment[] {
  const parsed: WhisperJson = JSON.parse(rawJson) as WhisperJson;
  if (!Array.isArray(parsed.transcription)) return [];
  return parsed.transcription.flatMap(
    (segment: WhisperSegment): TranscriptSegment[] => {
      const text: string = segment.text?.trim() || '';
      const startMs: number = parseWhisperTime(
        segment.offsets?.from ?? segment.timestamps?.from,
      );
      const endMs: number = parseWhisperTime(
        segment.offsets?.to ?? segment.timestamps?.to,
      );
      if (!text || endMs <= startMs) return [];
      return [{ startMs, endMs, text }];
    },
  );
}

export function fuseTranscriptSegments(
  input: FuseTranscriptInput,
): FusedTranscriptResult {
  const adjustedAuxiliary: TranscriptSegment[] = input.auxiliarySegments.map(
    (segment: TranscriptSegment): TranscriptSegment => ({
      ...segment,
      startMs: Math.max(0, segment.startMs + input.audioOffsetMs),
      endMs: Math.max(0, segment.endMs + input.audioOffsetMs),
    }),
  );
  const usedVideoIndices: Set<number> = new Set<number>();
  const blocks: Array<{ startMs: number; markdown: string }> = [];
  let conflictCount = 0;
  let corroboratedCount = 0;
  let singleSourceCount = 0;

  for (const auxiliary of adjustedAuxiliary) {
    const matchIndex: number = findBestOverlappingSegment(
      auxiliary,
      input.videoSegments,
      usedVideoIndices,
    );
    const timeLabel: string = formatTimeRange(
      auxiliary.startMs,
      auxiliary.endMs,
    );
    if (matchIndex < 0) {
      singleSourceCount += 1;
      blocks.push({
        startMs: auxiliary.startMs,
        markdown: `${timeLabel} [仅辅助录音] ${auxiliary.text}`,
      });
      continue;
    }
    usedVideoIndices.add(matchIndex);
    const video: TranscriptSegment = input.videoSegments[matchIndex];
    const consistent: boolean = areTranscriptsConsistent(
      auxiliary.text,
      video.text,
    );
    if (consistent) {
      corroboratedCount += 1;
      blocks.push({
        startMs: Math.min(auxiliary.startMs, video.startMs),
        markdown: `${timeLabel} [双路一致] ${auxiliary.text}`,
      });
      continue;
    }
    conflictCount += 1;
    blocks.push({
      startMs: Math.min(auxiliary.startMs, video.startMs),
      markdown: [
        `${timeLabel} [待核对]`,
        `- 辅助录音：${auxiliary.text}`,
        `- 视频音轨：${video.text}`,
      ].join('\n'),
    });
  }

  input.videoSegments.forEach(
    (video: TranscriptSegment, index: number): void => {
      if (usedVideoIndices.has(index)) return;
      singleSourceCount += 1;
      blocks.push({
        startMs: video.startMs,
        markdown: `${formatTimeRange(video.startMs, video.endMs)} [仅视频音轨] ${video.text}`,
      });
    },
  );

  return {
    conflictCount,
    corroboratedCount,
    markdown: blocks
      .sort(
        (
          first: { startMs: number; markdown: string },
          second: { startMs: number; markdown: string },
        ): number => first.startMs - second.startMs,
      )
      .map((block: { startMs: number; markdown: string }) => block.markdown)
      .join('\n\n'),
    singleSourceCount,
  };
}

function calculateCorrelation(
  first: number[],
  firstStart: number,
  second: number[],
  secondStart: number,
  length: number,
): number {
  let firstMean = 0;
  let secondMean = 0;
  for (let index = 0; index < length; index += 1) {
    firstMean += first[firstStart + index];
    secondMean += second[secondStart + index];
  }
  firstMean /= length;
  secondMean /= length;

  let numerator = 0;
  let firstVariance = 0;
  let secondVariance = 0;
  for (let index = 0; index < length; index += 1) {
    const firstDelta: number = first[firstStart + index] - firstMean;
    const secondDelta: number = second[secondStart + index] - secondMean;
    numerator += firstDelta * secondDelta;
    firstVariance += firstDelta * firstDelta;
    secondVariance += secondDelta * secondDelta;
  }
  if (firstVariance === 0 || secondVariance === 0) return 0;
  return numerator / Math.sqrt(firstVariance * secondVariance);
}

function parseWhisperTime(value: number | string | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  if (/^\d+$/u.test(value)) return Number(value);
  const match = value.match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/u);
  if (!match) return 0;
  return (
    Number(match[1]) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1_000 +
    Number(match[4])
  );
}

function findBestOverlappingSegment(
  target: TranscriptSegment,
  candidates: TranscriptSegment[],
  usedIndices: Set<number>,
): number {
  let bestIndex = -1;
  let bestOverlap = 0;
  candidates.forEach((candidate: TranscriptSegment, index: number): void => {
    if (usedIndices.has(index)) return;
    const overlap: number =
      Math.min(target.endMs, candidate.endMs) -
      Math.max(target.startMs, candidate.startMs);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function areTranscriptsConsistent(first: string, second: string): boolean {
  const normalizedFirst: string = normalizeTranscript(first);
  const normalizedSecond: string = normalizeTranscript(second);
  if (normalizedFirst === normalizedSecond) return true;
  if (hasConflictingNumericEvidence(normalizedFirst, normalizedSecond)) {
    return false;
  }
  return calculateDiceSimilarity(normalizedFirst, normalizedSecond) >=
    TRANSCRIPT_SIMILARITY_THRESHOLD;
}

function normalizeTranscript(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s，。！？、；：“”‘’（）()[\]{}<>《》]/gu, '');
}

function hasConflictingNumericEvidence(first: string, second: string): boolean {
  const numericPattern = /[零一二三四五六七八九十百千万亿两\d.%％]+/gu;
  const firstValues: string[] = first.match(numericPattern) || [];
  const secondValues: string[] = second.match(numericPattern) || [];
  if (firstValues.length === 0 && secondValues.length === 0) return false;
  return firstValues.join('|') !== secondValues.join('|');
}

function calculateDiceSimilarity(first: string, second: string): number {
  if (first.length < 2 || second.length < 2) {
    return first === second ? 1 : 0;
  }
  const firstPairs: Map<string, number> = buildPairCounts(first);
  const secondPairs: Map<string, number> = buildPairCounts(second);
  let intersection = 0;
  firstPairs.forEach((count: number, pair: string): void => {
    intersection += Math.min(count, secondPairs.get(pair) || 0);
  });
  return (2 * intersection) / (first.length - 1 + second.length - 1);
}

function buildPairCounts(value: string): Map<string, number> {
  const pairs: Map<string, number> = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const pair: string = value.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) || 0) + 1);
  }
  return pairs;
}

function formatTimeRange(startMs: number, endMs: number): string {
  return `[${formatTimestamp(startMs)}–${formatTimestamp(endMs)}]`;
}

function formatTimestamp(valueMs: number): string {
  const totalSeconds: number = Math.max(0, Math.floor(valueMs / 1_000));
  const hours: number = Math.floor(totalSeconds / 3_600);
  const minutes: number = Math.floor((totalSeconds % 3_600) / 60);
  const seconds: number = totalSeconds % 60;
  const prefix: string =
    hours > 0 ? `${String(hours).padStart(2, '0')}:` : '';
  return `${prefix}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
