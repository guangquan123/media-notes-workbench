import type {
  FrameDensity,
  NoteVisualOptions,
  UpdateFrameSelectionRequest,
  VisualPipelineWarning,
} from '@shared/api.interface';
import { BadRequestException } from '@nestjs/common';
import { hammingDistance, type KeyFrame } from './frame-extraction.service';
import type { TranscriptSegment } from './paired-media.utils';

const DENSITY_LIMITS: Record<
  FrameDensity,
  { max: number; spacingSec: number }
> = {
  compact: { max: 6, spacingSec: 20 * 60 },
  standard: { max: 12, spacingSec: 10 * 60 },
  detailed: { max: 24, spacingSec: 5 * 60 },
};

const PRESENTATION_TITLE_PATTERN =
  /(?:pptx?|presentation|slides?|webinar|培训|课程|课件|讲义|授课|教学)/iu;

export interface FrameContentSelection {
  frames: KeyFrame[];
  presentationMode: boolean;
}

export function validateFrameSelectionRequest(
  input: UpdateFrameSelectionRequest,
): void {
  if (
    !input ||
    !Array.isArray(input.selectedFrameIds) ||
    !Array.isArray(input.orderedFrameIds) ||
    !Number.isInteger(input.revision) ||
    input.revision < 0
  ) {
    throw new BadRequestException('关键帧选择参数不完整');
  }
  if (
    input.selectedFrameIds.length > 1_000 ||
    input.orderedFrameIds.length > 1_000
  ) {
    throw new BadRequestException('单次最多选择 1000 张关键帧');
  }
  if (
    input.selectedFrameIds.some(
      (id) => typeof id !== 'string' || id.trim().length === 0,
    ) ||
    input.orderedFrameIds.some(
      (id) => typeof id !== 'string' || id.trim().length === 0,
    )
  ) {
    throw new BadRequestException('关键帧 ID 无效');
  }
}

export function normalizeVisualOptions(
  input: NoteVisualOptions | undefined,
): NoteVisualOptions {
  if (!input) return { mode: 'disabled' };
  if (input.mode === 'disabled') return { mode: 'disabled' };
  return {
    allowExternalAi: input.allowExternalAi === true,
    density:
      input.density === 'compact' ||
      input.density === 'standard' ||
      input.density === 'detailed'
        ? input.density
        : 'standard',
    mode: input.mode === 'review' ? 'review' : 'automatic',
    outputMode:
      input.outputMode === 'original' ||
      input.outputMode === 'original_with_ai_notes' ||
      input.outputMode === 'original_with_ai_derivative'
        ? input.outputMode
        : 'original_with_ai_notes',
  };
}

export function transcriptRelevanceScore(
  frameTimestampSec: number,
  segments: readonly TranscriptSegment[],
): number {
  const nearby = segments.filter(
    (segment) =>
      segment.startMs <= (frameTimestampSec + 20) * 1_000 &&
      segment.endMs >= (frameTimestampSec - 20) * 1_000,
  );
  if (nearby.length === 0) return 0.25;
  const textLength = nearby.reduce(
    (sum, segment) => sum + segment.text.length,
    0,
  );
  return Math.min(1, 0.35 + textLength / 180);
}

export function scoreFrame(
  frame: KeyFrame,
  segments: readonly TranscriptSegment[] = [],
): number {
  const scene =
    frame.type === 'scene' ? Math.max(0.55, frame.sceneScore ?? 0) : 0.35;
  const uniqueness = Math.max(0, Math.min(1, frame.uniquenessScore ?? 0.5));
  const visual = Math.max(0, Math.min(1, frame.visualInformationScore ?? 0.5));
  const transcript = transcriptRelevanceScore(frame.timestamp, segments);
  return Number(
    (
      scene * 0.25 +
      uniqueness * 0.2 +
      visual * 0.3 +
      transcript * 0.25
    ).toFixed(4),
  );
}

export function selectKeyFrames(
  frames: readonly KeyFrame[],
  density: FrameDensity,
  totalDurationSec: number,
  segments: readonly TranscriptSegment[] = [],
): KeyFrame[] {
  if (frames.length === 0) return [];
  const config = DENSITY_LIMITS[density];
  const durationLimit = Math.max(
    1,
    Math.ceil(Math.max(1, totalDurationSec) / config.spacingSec),
  );
  const limit = Math.min(config.max, durationLimit);
  const scored = frames
    .map((frame) => ({ ...frame, selectionScore: scoreFrame(frame, segments) }))
    .sort(
      (a, b) =>
        (b.selectionScore ?? 0) - (a.selectionScore ?? 0) ||
        a.timestamp - b.timestamp,
    );

  const minGap = Math.max(
    12,
    Math.min(config.spacingSec / 2, totalDurationSec / limit / 2),
  );
  const selected: KeyFrame[] = [];
  for (const frame of scored) {
    if (
      selected.every(
        (item) => Math.abs(item.timestamp - frame.timestamp) >= minGap,
      )
    ) {
      selected.push(frame);
      if (selected.length >= limit) break;
    }
  }
  if (selected.length < limit) {
    for (const frame of scored) {
      if (!selected.some((item) => item.id === frame.id)) selected.push(frame);
      if (selected.length >= limit) break;
    }
  }
  return selected.sort((a, b) => a.timestamp - b.timestamp);
}

export function detectPresentationMode(
  frames: readonly KeyFrame[],
  sourceTitle = '',
): boolean {
  if (PRESENTATION_TITLE_PATTERN.test(sourceTitle)) return true;
  const analyzedFrames = frames.filter(
    (frame: KeyFrame): boolean => frame.analysis !== undefined,
  );
  if (analyzedFrames.length < 3) return false;
  const slideCount = analyzedFrames.filter(
    (frame: KeyFrame): boolean => frame.analysis?.isPresentationSlide === true,
  ).length;
  return slideCount >= 3 && slideCount / analyzedFrames.length >= 0.6;
}

export function sampleFramesEvenly(
  frames: readonly KeyFrame[],
  maximum = 6,
): KeyFrame[] {
  if (frames.length <= maximum) return [...frames];
  const indexes = new Set<number>();
  for (let index = 0; index < maximum; index += 1) {
    indexes.add(Math.round((index * (frames.length - 1)) / (maximum - 1)));
  }
  return [...indexes].map((index: number): KeyFrame => frames[index]);
}

export function selectPresentationFrames(
  frames: readonly KeyFrame[],
): KeyFrame[] {
  const selected: KeyFrame[] = [];
  const ordered = [...frames].sort(
    (left: KeyFrame, right: KeyFrame): number =>
      (left.globalTimestamp ?? left.timestamp) -
        (right.globalTimestamp ?? right.timestamp) ||
      left.sourceIndex - right.sourceIndex,
  );
  for (const frame of ordered) {
    if ((frame.visualInformationScore ?? 1) < 0.12) continue;
    const isDuplicate = selected.some((candidate: KeyFrame): boolean => {
      if (!candidate.perceptualHash || !frame.perceptualHash) return false;
      return (
        hammingDistance(candidate.perceptualHash, frame.perceptualHash) <= 2
      );
    });
    if (!isDuplicate) selected.push(frame);
  }
  return selected;
}

export function selectFramesForContent(
  frames: readonly KeyFrame[],
  density: FrameDensity,
  totalDurationSec: number,
  sourceTitle = '',
): FrameContentSelection {
  const presentationMode = detectPresentationMode(frames, sourceTitle);
  return {
    frames: presentationMode
      ? selectPresentationFrames(frames)
      : selectKeyFrames(frames, density, totalDurationSec),
    presentationMode,
  };
}

export function buildVisualWarnings(input: {
  analyzed: number;
  derivativeCount?: number;
  extracted: number;
  requestedAi: boolean;
  requestedDerivative?: boolean;
  selected: number;
  uploaded: number;
}): VisualPipelineWarning[] {
  const warnings: VisualPipelineWarning[] = [];
  if (input.extracted === 0) {
    warnings.push({
      code: 'NO_USEFUL_FRAMES',
      message: '未找到可用关键画面，笔记将仅使用文字内容。',
    });
  } else if (input.uploaded < input.selected) {
    warnings.push({
      code: 'FRAME_UPLOAD_PARTIAL',
      message: `有 ${input.selected - input.uploaded} 张关键画面上传失败。`,
    });
  }
  if (input.requestedAi && input.analyzed < input.uploaded) {
    warnings.push({
      code: 'FRAME_AI_PARTIAL',
      message: `有 ${input.uploaded - input.analyzed} 张画面未完成 AI 识别。`,
    });
  }
  if (
    input.requestedDerivative &&
    (input.derivativeCount || 0) < input.uploaded
  ) {
    warnings.push({
      code: 'FRAME_DERIVATIVE_PARTIAL',
      message: `有 ${
        input.uploaded - (input.derivativeCount || 0)
      } 张画面未生成 AI 派生图，已保留原图。`,
    });
  }
  return warnings;
}
