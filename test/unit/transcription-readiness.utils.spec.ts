import {
  isLocalWhisperReady,
  resolveAvailableTranscriptionProvider,
} from '../../shared/model-settings.utils';
import type { SystemReadiness } from '../../shared/api.interface';

const BASE_READINESS: SystemReadiness = {
  connectorReady: true,
  customApiTranscription: false,
  documentReady: true,
  ffmpeg: true,
  larkCli: true,
  mediaReady: true,
  pdfReady: true,
  platformReady: true,
  ready: true,
  tencentAsr: false,
  tencentAsrEnabled: false,
  whisperCli: true,
  whisperModel: true,
  ytDlp: true,
};

describe('transcription readiness routing', () => {
  it('starts locally when no configured cloud mode is available', () => {
    expect(isLocalWhisperReady(BASE_READINESS)).toBe(true);
    expect(
      resolveAvailableTranscriptionProvider(BASE_READINESS, 'custom_api'),
    ).toBe('local_whisper');
    expect(
      resolveAvailableTranscriptionProvider(BASE_READINESS, 'tencent_asr'),
    ).toBe('local_whisper');
  });

  it('keeps the selected cloud mode when it is ready', () => {
    expect(
      resolveAvailableTranscriptionProvider(
        { ...BASE_READINESS, customApiTranscription: true },
        'custom_api',
      ),
    ).toBe('custom_api');
    expect(
      resolveAvailableTranscriptionProvider(
        { ...BASE_READINESS, tencentAsr: true },
        'tencent_asr',
      ),
    ).toBe('tencent_asr');
  });

  it('uses another configured cloud mode before the local fallback', () => {
    expect(
      resolveAvailableTranscriptionProvider(
        { ...BASE_READINESS, tencentAsr: true },
        'custom_api',
      ),
    ).toBe('tencent_asr');
    expect(
      resolveAvailableTranscriptionProvider(
        { ...BASE_READINESS, customApiTranscription: true },
        'tencent_asr',
      ),
    ).toBe('custom_api');
  });

  it('does not claim a local fallback when either local file is missing', () => {
    expect(
      resolveAvailableTranscriptionProvider(
        { ...BASE_READINESS, whisperModel: false },
        'custom_api',
      ),
    ).toBeUndefined();
  });
});
