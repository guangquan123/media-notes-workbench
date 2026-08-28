import {
  buildHotwordList,
  getAudioContentType,
  resolveEngineModelType,
} from '../../server/modules/note-jobs/tencent-asr-transcription.service';

describe('Tencent ASR recording quality options', () => {
  it('upgrades legacy Mandarin engines for Sichuan or mixed speech', () => {
    expect(resolveEngineModelType('16k_zh', 'sichuan')).toBe('16k_zh_en_2.0');
    expect(resolveEngineModelType('16k_zh', 'mixed')).toBe('16k_zh_en_2.0');
    expect(resolveEngineModelType('16k_zh', 'cantonese')).toBe('16k_yue');
  });

  it('serializes bounded temporary hotwords without allowing request delimiters', () => {
    expect(buildHotwordList({ hotwords: ['四川项目', '人名,测试'] })).toBe(
      '四川项目|5,人名 测试|5',
    );
  });

  it('uses the correct content type for normalized WAV audio', () => {
    expect(getAudioContentType('audio-0.wav')).toBe('audio/wav');
  });
});
