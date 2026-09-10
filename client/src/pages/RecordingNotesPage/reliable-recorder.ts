import {
  appendStoredRecordingChunk,
  finishStoredRecording,
  startStoredRecording,
} from './recording-storage';
import {
  buildRecordingAudioConstraints,
  calculateAudioLevel,
  DEFAULT_RECORDING_AUDIO_PROFILE,
  DEFAULT_RECORDING_CAPTURE_MODE,
  getRecordingCaptureModeDefinition,
  getSupportedRecordingMimeType,
  SIGNAL_RMS_THRESHOLD,
  type RecordingAudioProfile,
  type RecordingCaptureMode,
} from './recording-note.utils';
import type { AudioActivityFrame } from '@/utils/recording-audio-analysis';

type RecorderInput = 'microphone' | 'system';

export interface RecorderSourceMetrics {
  inputDetected: boolean;
  peak: number;
  rms: number;
  silentForMs: number;
}

export interface RecorderMetrics {
  clipCount: number;
  inputDetected: boolean;
  peak: number;
  rms: number;
  silentForMs: number;
  sources: Partial<Record<RecorderInput, RecorderSourceMetrics>>;
}

export interface RecorderDeviceState {
  muted: boolean;
  state: 'checking' | 'ready' | 'ended' | 'muted' | 'error';
}

export interface RecordingResult {
  activityFrames: AudioActivityFrame[];
  bytes: number;
  captureMode: RecordingCaptureMode;
  chunkCount: number;
  durationMs: number;
  file: File;
  mimeType: string;
  sessionId: string;
}

export interface ReliableRecorderEvents {
  onChunk: (bytes: number, chunkCount: number) => void;
  onDeviceState: (state: RecorderDeviceState) => void;
  onError: (error: Error) => void;
  onMetrics: (metrics: RecorderMetrics) => void;
  onAutoStop?: (result: RecordingResult) => void;
  onStorageWarning: () => void;
}

export interface RecorderPreparation {
  audioProfile: RecordingAudioProfile;
  autoGainControl: boolean | null;
  captureMode: RecordingCaptureMode;
  channelCount: number;
  deviceLabel: string;
  echoCancellation: boolean | null;
  microphoneLabel?: string;
  noiseSuppression: boolean | null;
  sampleRate: number | null;
  systemAudioLabel?: string;
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `recording-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getRequiredInputs(mode: RecordingCaptureMode): RecorderInput[] {
  if (mode === 'microphone') return ['microphone'];
  if (mode === 'system') return ['system'];
  return ['microphone', 'system'];
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
}

export class ReliableRecorder {
  private activityFrames: AudioActivityFrame[] = [];
  private readonly events: ReliableRecorderEvents;
  private audioContext: AudioContext | null = null;
  private audioProfile: RecordingAudioProfile = DEFAULT_RECORDING_AUDIO_PROFILE;
  private captureMode: RecordingCaptureMode = DEFAULT_RECORDING_CAPTURE_MODE;
  private chunks: Blob[] = [];
  private chunkCount = 0;
  private clipCount = 0;
  private deviceState: RecorderDeviceState = { muted: false, state: 'checking' };
  private microphoneStream: MediaStream | null = null;
  private monitorFrame: number | null = null;
  private outputStream: MediaStream | null = null;
  private lastActivityFrameAt = 0;
  private pausedAt = 0;
  private pausedDurationMs = 0;
  private recorder: MediaRecorder | null = null;
  private sessionId: string | null = null;
  private sourceAnalysers: Partial<Record<RecorderInput, AnalyserNode>> = {};
  private sourceLastSignals: Record<RecorderInput, number> = {
    microphone: 0,
    system: 0,
  };
  private startedAt = 0;
  private storageFailed = false;
  private storageQueue: Promise<void> = Promise.resolve();
  private stopPromise: Promise<RecordingResult> | null = null;
  private stopped = false;
  private systemAudioStream: MediaStream | null = null;

  constructor(events: ReliableRecorderEvents) {
    this.events = events;
  }

  public async prepare(
    profile: RecordingAudioProfile = DEFAULT_RECORDING_AUDIO_PROFILE,
    captureMode: RecordingCaptureMode = DEFAULT_RECORDING_CAPTURE_MODE,
  ): Promise<RecorderPreparation> {
    this.assertCaptureSupport(captureMode);
    if (
      this.outputStream?.active &&
      this.audioProfile === profile &&
      this.captureMode === captureMode
    ) {
      return this.getPreparation();
    }
    this.release();
    this.stopped = false;
    this.audioProfile = profile;
    this.captureMode = captureMode;
    this.sourceLastSignals = { microphone: 0, system: 0 };
    this.events.onDeviceState({ muted: false, state: 'checking' });
    try {
      if (captureMode !== 'system') {
        this.microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: buildRecordingAudioConstraints(profile),
        });
        this.assertAudioTrack(this.microphoneStream, '麦克风');
      }
      if (captureMode !== 'microphone') {
        this.systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });
        this.assertAudioTrack(this.systemAudioStream, '共享音频');
      }
      await this.createMixedOutput();
      this.setDeviceState({ muted: false, state: 'ready' });
      return this.getPreparation();
    } catch (error: unknown) {
      this.release();
      throw error;
    }
  }

  public async start(title: string): Promise<void> {
    if (!this.outputStream?.active || !this.hasAllRequiredTracks()) {
      await this.prepare(this.audioProfile, this.captureMode);
    }
    if (!this.outputStream) throw new Error('声音输入尚未准备好');
    const mimeType: string | null = getSupportedRecordingMimeType();
    if (!mimeType) throw new Error('当前浏览器不支持可用的录音格式');
    this.chunks = [];
    this.activityFrames = [];
    this.chunkCount = 0;
    this.clipCount = 0;
    this.storageFailed = false;
    this.storageQueue = Promise.resolve();
    this.sessionId = createSessionId();
    this.sourceLastSignals = { microphone: 0, system: 0 };
    this.startedAt = Date.now();
    this.pausedAt = 0;
    this.pausedDurationMs = 0;
    this.lastActivityFrameAt = 0;
    this.stopped = false;
    try {
      await startStoredRecording({
        captureMode: this.captureMode,
        id: this.sessionId,
        mimeType,
        title,
      });
    } catch (error: unknown) {
      this.storageFailed = true;
      this.events.onStorageWarning();
      throw new Error(
        error instanceof Error
          ? `录音保护存储不可用：${error.message}`
          : '录音保护存储不可用，已阻止开始录音',
      );
    }
    this.recorder = new MediaRecorder(this.outputStream, {
      audioBitsPerSecond: 128_000,
      mimeType,
    });
    this.recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size === 0 || !this.sessionId) return;
      const index: number = this.chunkCount;
      this.chunks.push(event.data);
      this.chunkCount += 1;
      const bytes: number = this.chunks.reduce(
        (total: number, chunk: Blob) => total + chunk.size,
        0,
      );
      this.events.onChunk(bytes, this.chunkCount);
      this.persistChunk(event.data, index);
    };
    this.recorder.onerror = () => {
      this.pause();
      this.events.onError(new Error('浏览器录音器发生错误，已停止继续采集'));
    };
    this.recorder.start(1_000);
    if (this.recorder.state !== 'recording') {
      throw new Error('浏览器未进入录音状态，已阻止继续采集');
    }
  }

  public pause(): void {
    if (this.recorder?.state !== 'recording') return;
    this.pausedAt = Date.now();
    this.recorder.pause();
  }

  public resume(): void {
    if (this.recorder?.state !== 'paused') return;
    this.finishPause();
    this.recorder.resume();
  }

  public stop(): Promise<RecordingResult> {
    if (this.stopPromise) return this.stopPromise;
    const promise: Promise<RecordingResult> = new Promise<RecordingResult>(
      (resolve, reject) => {
        if (!this.recorder || !this.sessionId) {
          reject(new Error('当前没有正在进行的录音'));
          return;
        }
        const recorder: MediaRecorder = this.recorder;
        const sessionId: string = this.sessionId;
        const finish = async (): Promise<void> => {
          try {
            const durationMs: number = this.getDurationMs();
            await this.storageQueue;
            if (!this.storageFailed) await finishStoredRecording(sessionId, durationMs);
            const mimeType: string = recorder.mimeType || 'audio/webm';
            const file: File = new File(this.chunks, 'recording.webm', {
              type: mimeType,
            });
            this.stopped = true;
            resolve({
              activityFrames: this.activityFrames,
              bytes: file.size,
              captureMode: this.captureMode,
              chunkCount: this.chunkCount,
              durationMs,
              file,
              mimeType,
              sessionId,
            });
          } catch (error: unknown) {
            reject(error instanceof Error ? error : new Error('录音保存失败'));
          }
        };
        recorder.onstop = () => void finish();
        if (recorder.state === 'paused') {
          this.finishPause();
          recorder.resume();
        }
        recorder.requestData();
        recorder.stop();
      },
    );
    this.stopPromise = promise;
    promise
      .finally(() => {
        if (this.stopPromise === promise) this.stopPromise = null;
      })
      .catch(() => undefined);
    return promise;
  }

  public getDurationMs(): number {
    if (!this.startedAt) return 0;
    const endAt: number = this.pausedAt > 0 ? this.pausedAt : Date.now();
    return Math.max(0, endAt - this.startedAt - this.pausedDurationMs);
  }

  public release(): void {
    this.stopped = true;
    if (this.monitorFrame !== null) cancelAnimationFrame(this.monitorFrame);
    this.monitorFrame = null;
    stopStream(this.microphoneStream);
    stopStream(this.systemAudioStream);
    this.microphoneStream = null;
    this.systemAudioStream = null;
    stopStream(this.outputStream);
    this.outputStream = null;
    Object.values(this.sourceAnalysers).forEach(
      (analyser: AnalyserNode | undefined) => analyser?.disconnect(),
    );
    this.sourceAnalysers = {};
    if (this.audioContext) void this.audioContext.close();
    this.audioContext = null;
  }

  public getDeviceState(): RecorderDeviceState {
    return this.deviceState;
  }

  private assertCaptureSupport(captureMode: RecordingCaptureMode): void {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风录音，请使用最新版 Chrome、Edge 或 Safari');
    }
    if (captureMode !== 'microphone' && !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('当前浏览器不支持共享音频录制，请使用最新版 Chrome 或 Edge');
    }
    if (typeof AudioContext === 'undefined') {
      throw new Error('当前浏览器不支持声音混音处理，请使用最新版 Chrome、Edge 或 Safari');
    }
  }

  private assertAudioTrack(stream: MediaStream, name: string): void {
    const track: MediaStreamTrack | undefined = stream.getAudioTracks()[0];
    if (!track) {
      throw new Error(`${name}未提供音频。请重新选择支持音频共享的来源，并勾选共享音频。`);
    }
    if (track.readyState !== 'live') {
      throw new Error(`${name}音轨未处于可采集状态，请重新授权设备`);
    }
  }

  private async createMixedOutput(): Promise<void> {
    const context: AudioContext = new AudioContext();
    try {
      await context.resume();
      const destination: MediaStreamAudioDestinationNode = context.createMediaStreamDestination();
      const inputs: RecorderInput[] = getRequiredInputs(this.captureMode);
      inputs.forEach((input: RecorderInput) => {
        const stream: MediaStream | null =
          input === 'microphone' ? this.microphoneStream : this.systemAudioStream;
        if (!stream) throw new Error('声音输入尚未准备好');
        const source: MediaStreamAudioSourceNode = context.createMediaStreamSource(stream);
        const analyser: AnalyserNode = context.createAnalyser();
        analyser.fftSize = 2_048;
        source.connect(analyser);
        source.connect(destination);
        this.sourceAnalysers[input] = analyser;
        const track: MediaStreamTrack | undefined = stream.getAudioTracks()[0];
        if (track) this.attachTrackLifecycle(track, input);
      });
      this.audioContext = context;
      this.outputStream = destination.stream;
      this.startMonitoring();
    } catch (error: unknown) {
      await context.close().catch(() => undefined);
      throw error;
    }
  }

  private attachTrackLifecycle(track: MediaStreamTrack, input: RecorderInput): void {
    const definition = getRecordingCaptureModeDefinition(this.captureMode);
    const inputLabel: string = input === 'microphone' ? '麦克风' : '共享音频';
    track.onended = () => {
      if (this.stopped) return;
      this.setDeviceState({ muted: false, state: 'ended' });
      this.events.onError(new Error(`${inputLabel}连接已断开，当前${definition.label}已停止采集`));
      this.stopAfterInputFailure(`${inputLabel}断开后无法保存录音`);
    };
    track.onmute = () => {
      if (this.stopped) return;
      this.setDeviceState({ muted: true, state: 'muted' });
      this.pause();
      this.events.onError(new Error(`${inputLabel}被系统静音，录音已自动暂停，请恢复后继续`));
    };
    track.onunmute = () => {
      if (!this.stopped) this.setDeviceState({ muted: false, state: 'ready' });
    };
  }

  private getPreparation(): RecorderPreparation {
    const microphoneTrack: MediaStreamTrack | undefined = this.microphoneStream?.getAudioTracks()[0];
    const systemTrack: MediaStreamTrack | undefined = this.systemAudioStream?.getAudioTracks()[0];
    const settings: MediaTrackSettings = microphoneTrack?.getSettings() || {};
    const labels: string[] = [microphoneTrack?.label, systemTrack?.label].filter(
      (label: string | undefined): label is string => Boolean(label),
    );
    return {
      audioProfile: this.audioProfile,
      autoGainControl: settings.autoGainControl ?? null,
      captureMode: this.captureMode,
      channelCount: settings.channelCount || 1,
      deviceLabel: labels.join(' + ') || getRecordingCaptureModeDefinition(this.captureMode).label,
      echoCancellation: settings.echoCancellation ?? null,
      microphoneLabel: microphoneTrack?.label || undefined,
      noiseSuppression: settings.noiseSuppression ?? null,
      sampleRate: settings.sampleRate || this.audioContext?.sampleRate || null,
      systemAudioLabel: systemTrack?.label || undefined,
    };
  }

  private hasAllRequiredTracks(): boolean {
    return getRequiredInputs(this.captureMode).every((input: RecorderInput) => {
      const stream: MediaStream | null =
        input === 'microphone' ? this.microphoneStream : this.systemAudioStream;
      return Boolean(stream?.active && stream.getAudioTracks()[0]?.readyState === 'live');
    });
  }

  private persistChunk(blob: Blob, index: number): void {
    if (this.storageFailed || !this.sessionId) return;
    const sessionId: string = this.sessionId;
    this.storageQueue = this.storageQueue
      .then(async () => {
        await appendStoredRecordingChunk({
          blob,
          durationMs: this.getDurationMs(),
          index,
          sessionId,
        });
      })
      .catch(() => {
        this.storageFailed = true;
        this.pause();
        this.events.onStorageWarning();
      });
  }

  private setDeviceState(state: RecorderDeviceState): void {
    this.deviceState = state;
    this.events.onDeviceState(state);
  }

  private startMonitoring(): void {
    const inputs: RecorderInput[] = getRequiredInputs(this.captureMode);
    const samples: Partial<Record<RecorderInput, Uint8Array<ArrayBuffer>>> = {};
    inputs.forEach((input: RecorderInput) => {
      const analyser: AnalyserNode | undefined = this.sourceAnalysers[input];
      if (analyser) samples[input] = new Uint8Array(analyser.fftSize);
    });
    const monitor = (): void => {
      if (!this.audioContext || this.stopped) return;
      const now: number = Date.now();
      const sourceMetrics: Partial<Record<RecorderInput, RecorderSourceMetrics>> = {};
      let combinedPeak = 0;
      let combinedRms = 0;
      inputs.forEach((input: RecorderInput) => {
        const analyser: AnalyserNode | undefined = this.sourceAnalysers[input];
        const inputSamples: Uint8Array<ArrayBuffer> | undefined = samples[input];
        if (!analyser || !inputSamples) return;
        analyser.getByteTimeDomainData(inputSamples);
        const { peak, rms } = calculateAudioLevel(inputSamples);
        if (rms >= SIGNAL_RMS_THRESHOLD) this.sourceLastSignals[input] = now;
        combinedPeak = Math.max(combinedPeak, peak);
        combinedRms = Math.max(combinedRms, rms);
        sourceMetrics[input] = {
          inputDetected: this.sourceLastSignals[input] > 0,
          peak,
          rms,
          silentForMs: this.sourceLastSignals[input] > 0 ? now - this.sourceLastSignals[input] : 0,
        };
      });
      const inputDetected: boolean = inputs.every(
        (input: RecorderInput) => sourceMetrics[input]?.inputDetected === true,
      );
      const silentForMs: number = inputDetected
        ? Math.max(...inputs.map((input: RecorderInput) => sourceMetrics[input]?.silentForMs || 0))
        : 0;
      if (combinedPeak >= 0.98) this.clipCount += 1;
      this.captureActivityFrame(now, combinedPeak, combinedRms);
      this.events.onMetrics({
        clipCount: this.clipCount,
        inputDetected,
        peak: combinedPeak,
        rms: combinedRms,
        silentForMs,
        sources: sourceMetrics,
      });
      this.monitorFrame = requestAnimationFrame(monitor);
    };
    monitor();
  }

  private stopAfterInputFailure(errorPrefix: string): void {
    if (this.recorder?.state !== 'recording' && this.recorder?.state !== 'paused') return;
    void this.stop()
      .then((result: RecordingResult) => this.events.onAutoStop?.(result))
      .catch((error: unknown) => {
        this.events.onError(error instanceof Error ? error : new Error(errorPrefix));
      });
  }

  private captureActivityFrame(
    now: number,
    peak: number,
    rms: number,
  ): void {
    if (this.recorder?.state !== 'recording') return;
    if (now - this.lastActivityFrameAt < 250) return;
    const endMs: number = this.getDurationMs();
    const previous: AudioActivityFrame | undefined = this.activityFrames.at(-1);
    const startMs: number = previous
      ? previous.endMs
      : Math.max(0, endMs - 250);
    if (endMs <= startMs) return;
    this.activityFrames.push({ endMs, peak, rms, startMs });
    this.lastActivityFrameAt = now;
  }

  private finishPause(): void {
    if (this.pausedAt <= 0) return;
    this.pausedDurationMs += Date.now() - this.pausedAt;
    this.pausedAt = 0;
  }
}
