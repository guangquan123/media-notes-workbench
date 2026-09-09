import {
  buildRecordingAudioConstraints,
  buildRecordingFileName,
  DEFAULT_RECORDING_AUDIO_PROFILE,
  getRecordingAssetSource,
  getRecordingCaptureModeDefinition,
  validateRecordingFile,
} from '../../client/src/pages/RecordingNotesPage/recording-note.utils';

type AudioLoadOutcome = 'canplay' | 'error';

class FakeAudioElement {
  public duration: number = Number.NaN;
  public oncanplay: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onloadedmetadata: (() => void) | null = null;
  public preload: string = '';
  public readyState: number = 0;
  public src: string = '';

  public static loadOutcome: AudioLoadOutcome = 'canplay';

  public load(): void {
    if (FakeAudioElement.loadOutcome === 'canplay') {
      this.oncanplay?.();
      return;
    }
    this.onerror?.();
  }
}

describe('recording note integrity helpers', () => {
  const originalAudioDescriptor: PropertyDescriptor | undefined =
    Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  const originalWindowDescriptor: PropertyDescriptor | undefined =
    Object.getOwnPropertyDescriptor(globalThis, 'window');

  beforeEach(() => {
    FakeAudioElement.loadOutcome = 'canplay';
    Object.defineProperty(globalThis, 'Audio', {
      configurable: true,
      value: FakeAudioElement,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: globalThis,
    });
    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recording-test');
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalAudioDescriptor) {
      Object.defineProperty(globalThis, 'Audio', originalAudioDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'Audio');
    }
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('accepts a playable recording when the browser omits media duration', async () => {
    const file: File = new File([new Uint8Array(2_048)], 'recording.webm', {
      type: 'audio/webm',
    });

    await expect(validateRecordingFile(file, 5_000)).resolves.toEqual({
      measuredDurationMs: 5_000,
      message: '文件可以播放，浏览器未返回媒体时长，已使用录音计时校验',
      status: 'passed',
    });
  });

  it('still rejects an audio file that cannot be played or decoded', async () => {
    FakeAudioElement.loadOutcome = 'error';
    const file: File = new File([new Uint8Array(2_048)], 'recording.webm', {
      type: 'audio/webm',
    });

    await expect(validateRecordingFile(file, 5_000)).resolves.toEqual({
      measuredDurationMs: null,
      message: '音频文件无法播放或解码，可能没有写入有效音频帧',
      status: 'failed',
    });
  });

  it('uses the m4a extension for Safari MP4 recordings', () => {
    expect(buildRecordingFileName('会议录音', 'audio/mp4')).toBe(
      '会议录音.m4a',
    );
  });

  it('uses a fidelity-first capture profile so dialect tones are not aggressively processed', () => {
    expect(buildRecordingAudioConstraints(DEFAULT_RECORDING_AUDIO_PROFILE)).toMatchObject({
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48_000 },
    });
  });

  it('enables protective processing only for noisy environments', () => {
    expect(buildRecordingAudioConstraints('noisy')).toMatchObject({
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    });
  });

  it('reduces echo and noise without gain pumping in meeting mode', () => {
    expect(buildRecordingAudioConstraints('clarity')).toMatchObject({
      autoGainControl: false,
      echoCancellation: true,
      noiseSuppression: true,
    });
  });

  it('keeps computer-audio capture copy explicit about browser sharing', () => {
    expect(getRecordingCaptureModeDefinition('system')).toMatchObject({
      label: '电脑声音',
      connectionStep: '选择共享音频',
    });
    expect(getRecordingCaptureModeDefinition('system').permissionDescription).toContain(
      '共享音频',
    );
  });

  it('maps each capture mode to its persisted recording source', () => {
    expect(getRecordingAssetSource('microphone')).toBe('microphone');
    expect(getRecordingAssetSource('system')).toBe('system_audio');
    expect(getRecordingAssetSource('mixed')).toBe('mixed_audio');
  });
});
