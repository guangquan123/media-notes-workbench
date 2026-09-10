export type AudioAnalysisSourceMode = 'microphone' | 'system' | 'mixed';

export interface AudioActivityFrame {
  endMs: number;
  peak: number;
  rms: number;
  startMs: number;
}

export interface SmartPlaybackSkipSegment {
  category: 'quiet';
  confidence: 'high';
  id: string;
  sourceEndMs: number;
  sourceStartMs: number;
}

export interface RecordingAudioAnalysis {
  compressibleSegments: SmartPlaybackSkipSegment[];
  hasMonitoringGaps: boolean;
  status: 'ready' | 'unavailable';
}

export interface SmartPlaybackSummary {
  savedDurationMs: number;
  smartDurationMs: number;
}

export interface ConservativeAudioAnalysisInput {
  captureMode: AudioAnalysisSourceMode;
  durationMs: number;
  frames: AudioActivityFrame[];
}

const MAX_FRAME_GAP_MS = 1_250;
const QUIET_RMS_THRESHOLD = 0.006;
const QUIET_PEAK_THRESHOLD = 0.025;
const MIN_QUIET_DURATION_MS = 5_000;
const QUIET_BOUNDARY_PADDING_MS = 750;

function isQuietFrame(frame: AudioActivityFrame): boolean {
  return (
    Number.isFinite(frame.rms) &&
    Number.isFinite(frame.peak) &&
    frame.rms <= QUIET_RMS_THRESHOLD &&
    frame.peak <= QUIET_PEAK_THRESHOLD
  );
}

function buildQuietSegment(
  startMs: number,
  endMs: number,
  index: number,
): SmartPlaybackSkipSegment | null {
  const durationMs: number = endMs - startMs;
  if (durationMs < MIN_QUIET_DURATION_MS) return null;
  const sourceStartMs: number = startMs + QUIET_BOUNDARY_PADDING_MS;
  const sourceEndMs: number = endMs - QUIET_BOUNDARY_PADDING_MS;
  if (sourceEndMs <= sourceStartMs) return null;
  return {
    category: 'quiet',
    confidence: 'high',
    id: `quiet-${index}`,
    sourceEndMs,
    sourceStartMs,
  };
}

export function buildConservativeAudioAnalysis(
  input: ConservativeAudioAnalysisInput,
): RecordingAudioAnalysis {
  if (input.captureMode !== 'microphone' || input.frames.length === 0) {
    return {
      compressibleSegments: [],
      hasMonitoringGaps: false,
      status: input.frames.length === 0 ? 'unavailable' : 'ready',
    };
  }

  const frames: AudioActivityFrame[] = [...input.frames]
    .filter(
      (frame: AudioActivityFrame) =>
        frame.startMs >= 0 &&
        frame.endMs > frame.startMs &&
        frame.endMs <= input.durationMs + MAX_FRAME_GAP_MS,
    )
    .sort(
      (left: AudioActivityFrame, right: AudioActivityFrame) =>
        left.startMs - right.startMs,
    );
  if (frames.length === 0) {
    return {
      compressibleSegments: [],
      hasMonitoringGaps: false,
      status: 'unavailable',
    };
  }

  const segments: SmartPlaybackSkipSegment[] = [];
  let hasMonitoringGaps: boolean = false;
  let quietStartMs: number | null = null;
  let quietEndMs: number | null = null;
  let segmentIndex: number = 1;
  let previousEndMs: number = frames[0].startMs;

  const closeQuietInterval = (): void => {
    if (quietStartMs === null || quietEndMs === null) return;
    const segment: SmartPlaybackSkipSegment | null = buildQuietSegment(
      quietStartMs,
      quietEndMs,
      segmentIndex,
    );
    if (segment) {
      segments.push(segment);
      segmentIndex += 1;
    }
    quietStartMs = null;
    quietEndMs = null;
  };

  frames.forEach((frame: AudioActivityFrame) => {
    if (frame.startMs - previousEndMs > MAX_FRAME_GAP_MS) {
      hasMonitoringGaps = true;
      closeQuietInterval();
    }
    if (isQuietFrame(frame)) {
      quietStartMs = quietStartMs ?? frame.startMs;
      quietEndMs = frame.endMs;
    } else {
      closeQuietInterval();
    }
    previousEndMs = Math.max(previousEndMs, frame.endMs);
  });
  closeQuietInterval();

  return {
    compressibleSegments: segments,
    hasMonitoringGaps,
    status: 'ready',
  };
}

export function getSmartPlaybackSummary(
  durationMs: number,
  segments: SmartPlaybackSkipSegment[],
): SmartPlaybackSummary {
  const savedDurationMs: number = segments.reduce(
    (total: number, segment: SmartPlaybackSkipSegment) =>
      total + Math.max(0, segment.sourceEndMs - segment.sourceStartMs),
    0,
  );
  return {
    savedDurationMs,
    smartDurationMs: Math.max(0, durationMs - savedDurationMs),
  };
}

export function findSmartPlaybackSkip(
  sourcePositionMs: number,
  segments: SmartPlaybackSkipSegment[],
): SmartPlaybackSkipSegment | null {
  return (
    segments.find(
      (segment: SmartPlaybackSkipSegment) =>
        sourcePositionMs >= segment.sourceStartMs &&
        sourcePositionMs < segment.sourceEndMs,
    ) || null
  );
}
