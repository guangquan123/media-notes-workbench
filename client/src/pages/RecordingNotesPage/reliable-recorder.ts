import {
  appendStoredRecordingChunk,
  finishStoredRecording,
  startStoredRecording,
} from './recording-storage';
import {
  buildRecordingAudioConstraints,
  DEFAULT_RECORDING_AUDIO_PROFILE,
  calculateAudioLevel,
  getSupportedRecordingMimeType,
  SIGNAL_RMS_THRESHOLD,
  type RecordingAudioProfile,
} from './recording-note.utils';

export interface RecorderMetrics {
  clipCount: number;
  inputDetected: boolean;
  peak: number;
  rms: number;
  silentForMs: number;
}

export interface RecorderDeviceState {
  muted: boolean;
  state: 'checking' | 'ready' | 'ended' | 'muted' | 'error';
}

export interface RecordingResult {
  bytes: number;
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
  channelCount: number;
  deviceLabel: string;
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  sampleRate: number | null;
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `recording-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class ReliableRecorder {
  private readonly events: ReliableRecorderEvents;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private chunkCount = 0;
  private clipCount = 0;
  private deviceState: RecorderDeviceState = {
    muted: false,
    state: 'checking',
  };
  private lastSignalAt = 0;
  private monitorFrame: number | null = null;
  private recorder: MediaRecorder | null = null;
  private sessionId: string | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  private pausedDurationMs = 0;
  private audioProfile: RecordingAudioProfile = DEFAULT_RECORDING_AUDIO_PROFILE;
  private storageQueue: Promise<void> = Promise.resolve();
  private storageFailed = false;
  private stream: MediaStream | null = null;
  private stopPromise: Promise<RecordingResult> | null = null;
  private stopped = false;

  constructor(events: ReliableRecorderEvents) {
    this.events = events;
  }

  public async prepare(
    profile: RecordingAudioProfile = DEFAULT_RECORDING_AUDIO_PROFILE,
  ): Promise<RecorderPreparation> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风录音，请使用最新版 Chrome、Edge 或 Safari');
    }
    if (this.stream?.active && this.audioProfile === profile) {
      return this.getPreparation();
    }
    this.events.onDeviceState({ muted: false, state: 'checking' });
    if (this.stream?.active) {
      const track = this.stream.getAudioTracks()[0];
      if (track) {
        try {
          await track.applyConstraints(buildRecordingAudioConstraints(profile));
          this.audioProfile = profile;
          return this.getPreparation();
        } catch {
          this.stream.getTracks().forEach((current) => current.stop());
          this.stream = null;
        }
      } else {
        this.stream.getTracks().forEach((current) => current.stop());
        this.stream = null;
      }
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: buildRecordingAudioConstraints(profile),
    });
    this.audioProfile = profile;
    const track: MediaStreamTrack | undefined = this.stream.getAudioTracks()[0];
    if (!track) throw new Error('没有获得有效的麦克风音轨');
    if (track.readyState !== 'live') {
      throw new Error('麦克风音轨未处于可采集状态，请重新授权设备');
    }
    track.onended = () => {
      if (this.stopped) return;
      this.setDeviceState({ muted: false, state: 'ended' });
      this.events.onError(new Error('麦克风连接已断开，当前录音已停止采集'));
      if (this.recorder?.state === 'recording' || this.recorder?.state === 'paused') {
        void this.stop()
          .then((result: RecordingResult) => {
            this.events.onAutoStop?.(result);
          })
          .catch((error: unknown) => {
            this.events.onError(
              error instanceof Error
                ? error
                : new Error('麦克风断开后无法保存录音'),
            );
          });
      }
    };
    track.onmute = () => {
      this.setDeviceState({ muted: true, state: 'muted' });
      if (this.recorder?.state === 'recording') {
        this.recorder.pause();
        this.events.onError(
          new Error('麦克风被系统静音，录音已自动暂停，请恢复设备后继续'),
        );
      }
    };
    track.onunmute = () => this.setDeviceState({ muted: false, state: 'ready' });
    this.audioContext = new AudioContext();
    await this.audioContext.resume();
    const source: MediaStreamAudioSourceNode =
      this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2_048;
    source.connect(this.analyser);
    this.stopped = false;
    this.startMonitoring();
    this.setDeviceState({ muted: false, state: 'ready' });
    return this.getPreparation();
  }

  public async start(title: string): Promise<void> {
    if (!this.stream?.active || !this.analyser) await this.prepare();
    if (!this.stream) throw new Error('麦克风尚未准备好');
    const mimeType: string | null = getSupportedRecordingMimeType();
    if (!mimeType) throw new Error('当前浏览器不支持可用的录音格式');
    this.chunks = [];
    this.chunkCount = 0;
    this.clipCount = 0;
    this.storageFailed = false;
    this.storageQueue = Promise.resolve();
    this.sessionId = createSessionId();
    this.lastSignalAt = 0;
    this.startedAt = Date.now();
    this.pausedAt = 0;
    this.pausedDurationMs = 0;
    this.stopped = false;
    try {
      await startStoredRecording({
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
    this.recorder = new MediaRecorder(this.stream, {
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
      if (!this.storageFailed) {
        const sessionId: string = this.sessionId;
        this.storageQueue = this.storageQueue
          .then(async () => {
            await appendStoredRecordingChunk({
              blob: event.data,
              durationMs: this.getDurationMs(),
              index,
              sessionId,
            });
          })
          .catch(() => {
            this.storageFailed = true;
            if (this.recorder?.state === 'recording') {
              this.recorder.pause();
            }
            this.events.onStorageWarning();
          });
      }
    };
    this.recorder.onerror = () => {
      if (this.recorder?.state === 'recording') this.recorder.pause();
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
    if (this.pausedAt > 0) this.pausedDurationMs += Date.now() - this.pausedAt;
    this.pausedAt = 0;
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
            if (!this.storageFailed) {
              await finishStoredRecording(sessionId, durationMs);
            }
            const mimeType: string = recorder.mimeType || 'audio/webm';
            const file: File = new File(this.chunks, 'recording.webm', {
              type: mimeType,
            });
            this.stopped = true;
            resolve({
              bytes: file.size,
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
        recorder.onstop = () => {
          void finish();
        };
        if (recorder.state === 'paused') recorder.resume();
        recorder.requestData();
        recorder.stop();
      },
    );
    this.stopPromise = promise;
    promise.then(
      () => {
        if (this.stopPromise === promise) this.stopPromise = null;
      },
      () => {
        if (this.stopPromise === promise) this.stopPromise = null;
      },
    );
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
    this.stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    this.stream = null;
    this.analyser?.disconnect();
    this.analyser = null;
    if (this.audioContext) void this.audioContext.close();
    this.audioContext = null;
  }

  public getDeviceState(): RecorderDeviceState {
    return this.deviceState;
  }

  private getPreparation(): RecorderPreparation {
    const track: MediaStreamTrack | undefined = this.stream?.getAudioTracks()[0];
    const settings: MediaTrackSettings = track?.getSettings() || {};
    return {
      audioProfile: this.audioProfile,
      autoGainControl: settings.autoGainControl ?? null,
      channelCount: settings.channelCount || 1,
      deviceLabel: track?.label || '默认麦克风',
      echoCancellation: settings.echoCancellation ?? null,
      noiseSuppression: settings.noiseSuppression ?? null,
      sampleRate: settings.sampleRate || this.audioContext?.sampleRate || null,
    };
  }

  private setDeviceState(state: RecorderDeviceState): void {
    this.deviceState = state;
    this.events.onDeviceState(state);
  }

  private startMonitoring(): void {
    if (!this.analyser) return;
    const samples: Uint8Array<ArrayBuffer> = new Uint8Array(
      this.analyser.fftSize,
    ) as Uint8Array<ArrayBuffer>;
    const monitor = (): void => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(samples);
      const { peak, rms } = calculateAudioLevel(samples);
      const now: number = Date.now();
      if (rms >= SIGNAL_RMS_THRESHOLD) this.lastSignalAt = now;
      if (peak >= 0.98) this.clipCount += 1;
      this.events.onMetrics({
        clipCount: this.clipCount,
        inputDetected: this.lastSignalAt > 0,
        peak,
        rms,
        silentForMs: this.lastSignalAt > 0 ? now - this.lastSignalAt : 0,
      });
      this.monitorFrame = requestAnimationFrame(monitor);
    };
    monitor();
  }
}
