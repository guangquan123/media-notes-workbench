export const MIN_RECORDING_DURATION_MS = 3_000;
export const SIGNAL_RMS_THRESHOLD = 0.018;
export const SILENCE_WARNING_MS = 12_000;

export type RecordingAudioProfile = 'fidelity' | 'clarity' | 'noisy';

export const DEFAULT_RECORDING_AUDIO_PROFILE: RecordingAudioProfile = 'fidelity';

export function buildRecordingAudioConstraints(
  profile: RecordingAudioProfile = DEFAULT_RECORDING_AUDIO_PROFILE,
): MediaTrackConstraints {
  const processing = profile === 'fidelity'
    ? { autoGainControl: false, echoCancellation: false, noiseSuppression: false }
    : profile === 'noisy'
      ? { autoGainControl: true, echoCancellation: true, noiseSuppression: true }
      : { autoGainControl: true, echoCancellation: true, noiseSuppression: true };
  return {
    ...processing,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48_000 },
    sampleSize: { ideal: 16 },
  };
}

export type RecordingIntegrityStatus = 'passed' | 'review' | 'failed';

export interface RecordingIntegrityCheck {
  measuredDurationMs: number | null;
  message: string;
  status: RecordingIntegrityStatus;
}

const RECORDING_MIME_TYPES: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

export function getSupportedRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return (
    RECORDING_MIME_TYPES.find((mimeType: string) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) || null
  );
}

export function calculateAudioLevel(samples: Uint8Array): {
  peak: number;
  rms: number;
} {
  if (samples.length === 0) return { peak: 0, rms: 0 };
  let peak: number = 0;
  let sumSquares: number = 0;
  samples.forEach((sample: number) => {
    const normalized: number = (sample - 128) / 128;
    peak = Math.max(peak, Math.abs(normalized));
    sumSquares += normalized * normalized;
  });
  return {
    peak,
    rms: Math.sqrt(sumSquares / samples.length),
  };
}

export function formatRecordingDuration(durationMs: number): string {
  const totalSeconds: number = Math.max(0, Math.floor(durationMs / 1_000));
  const hours: number = Math.floor(totalSeconds / 3_600);
  const minutes: number = Math.floor((totalSeconds % 3_600) / 60);
  const seconds: number = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value: number) => String(value).padStart(2, '0'))
    .join(':');
}

export function formatRecordingBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_024 / 1_024).toFixed(1)} MB`;
}

export function buildRecordingFileName(title: string, mimeType: string): string {
  const safeTitle: string = title
    .trim()
    .replace(/[\\/:*?"<>|]/gu, '-')
    .slice(0, 80) || '未命名录音';
  const extension: string = mimeType.includes('ogg')
    ? 'ogg'
    : mimeType.includes('mp4')
      ? 'm4a'
      : 'webm';
  return `${safeTitle}.${extension}`;
}

export function getDefaultRecordingTitle(date: Date = new Date()): string {
  const datePart: string = new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
    .format(date)
    .replace(/\//gu, '-');
  const timePart: string = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  })
    .format(date)
    .replace(':', '-');
  return `录音笔记 ${datePart} ${timePart}`;
}

export function getMicrophoneErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) return '无法访问麦克风，请稍后重试';
  if (error.name === 'NotAllowedError') {
    return '麦克风权限未开启，请在浏览器地址栏允许访问后重试';
  }
  if (error.name === 'NotFoundError') return '没有检测到可用麦克风';
  if (error.name === 'NotReadableError') {
    return '麦克风正被其他程序占用，请关闭占用程序后重试';
  }
  return `麦克风启动失败：${error.message || error.name}`;
}

export async function validateRecordingFile(
  file: File,
  expectedDurationMs: number,
): Promise<RecordingIntegrityCheck> {
  if (file.size < 1_024) {
    return {
      measuredDurationMs: null,
      message: '录音文件体积异常，可能没有写入有效声音数据',
      status: 'failed',
    };
  }
  if (typeof Audio === 'undefined') {
    return {
      measuredDurationMs: null,
      message: '当前环境无法自动校验音频，请试听确认后再继续',
      status: 'review',
    };
  }
  const objectUrl: string = URL.createObjectURL(file);
  try {
    const mediaProbe: AudioProbeResult = await probeAudioElement(objectUrl);
    const decodedDurationMs: number | null =
      mediaProbe.durationMs || (await decodeAudioDuration(file));
    if (decodedDurationMs === null && !mediaProbe.playable) {
      return {
        measuredDurationMs: null,
        message: '音频文件无法播放或解码，可能没有写入有效音频帧',
        status: 'failed',
      };
    }
    if (decodedDurationMs === null) {
      return {
        measuredDurationMs: expectedDurationMs,
        message: '文件可以播放，浏览器未返回媒体时长，已使用录音计时校验',
        status: 'passed',
      };
    }
    const measuredDurationMs: number = decodedDurationMs;
    const durationDeltaMs: number = Math.abs(
      measuredDurationMs - expectedDurationMs,
    );
    const toleranceMs: number = Math.max(1_500, expectedDurationMs * 0.1);
    if (durationDeltaMs > toleranceMs) {
      return {
        measuredDurationMs,
        message: `文件可播放，但检测到时长差异（${formatRecordingDuration(
          durationDeltaMs,
        )}），请试听确认没有漏录`,
        status: 'review',
      };
    }
    return {
      measuredDurationMs,
      message: '文件可播放，媒体时长与录音计时一致',
      status: 'passed',
    };
  } catch (error: unknown) {
    return {
      measuredDurationMs: null,
      message:
        error instanceof Error
          ? error.message
          : '音频文件无法完成完整性校验',
      status: 'failed',
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface AudioProbeResult {
  durationMs: number | null;
  playable: boolean;
}

function probeAudioElement(objectUrl: string): Promise<AudioProbeResult> {
  return new Promise<AudioProbeResult>((resolve) => {
    const audio: HTMLAudioElement = new Audio();
    let playable: boolean = false;
    let settled: boolean = false;
    const timeoutId: number = window.setTimeout(() => {
      finish(null, playable);
    }, 3_000);
    const finish = (durationMs: number | null, canPlay: boolean): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      audio.onloadedmetadata = null;
      audio.oncanplay = null;
      audio.onerror = null;
      resolve({ durationMs, playable: canPlay });
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      playable = audio.readyState >= HTMLMediaElement.HAVE_METADATA;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        finish(audio.duration * 1_000, true);
      }
    };
    audio.oncanplay = () => {
      playable = true;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        finish(audio.duration * 1_000, true);
      }
    };
    audio.onerror = () => finish(null, false);
    audio.src = objectUrl;
    audio.load();
  });
}

async function decodeAudioDuration(file: File): Promise<number | null> {
  if (typeof AudioContext === 'undefined') return null;
  let context: AudioContext | null = null;
  try {
    context = new AudioContext();
    const audioBuffer: AudioBuffer = await context.decodeAudioData(
      await file.arrayBuffer(),
    );
    return audioBuffer.duration > 0 ? audioBuffer.duration * 1_000 : null;
  } catch {
    return null;
  } finally {
    if (context) await context.close().catch(() => undefined);
  }
}
