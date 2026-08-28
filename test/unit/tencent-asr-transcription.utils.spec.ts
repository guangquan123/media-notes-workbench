import {
  buildHotwordList,
  getAudioContentType,
  resolveEngineModelType,
} from '../../server/modules/note-jobs/tencent-asr-transcription.service';
import { formatTencentAsrError, isTencentAsrQuotaError } from '../../server/modules/note-jobs/tencent-asr-error.utils';

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

  it('drops hotwords that become empty after delimiter sanitization', () => {
    expect(buildHotwordList({ hotwords: [',,,', '|||'] })).toBeUndefined();
  });

  it('truncates each serialized hotword to the provider limit', () => {
    const longHotword: string = '一'.repeat(40);
    expect(buildHotwordList({ hotwords: [longHotword] })).toBe(
      `${'一'.repeat(30)}|5`,
    );
  });

  it('uses the correct content type for normalized WAV audio', () => {
    expect(getAudioContentType('audio-0.wav')).toBe('audio/wav');
  });

  it('recognizes exhausted ASR resources and explains the local fallback', () => {
    const error = { code: 'FailedOperation.UserHasNoFreeAmount', message: 'resource package exhausted' };

    expect(isTencentAsrQuotaError(error)).toBe(true);
    expect(formatTencentAsrError(error)).toContain('额度已耗尽');
    expect(formatTencentAsrError(error)).toContain('本地转录');
  });

});
