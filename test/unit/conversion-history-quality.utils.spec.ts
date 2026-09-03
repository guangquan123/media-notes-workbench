import { getQualityWarningCopy } from '../../client/src/pages/ConversionHistoryPage/conversion-history-quality.utils';

describe('conversion history quality warning copy', () => {
  it('returns the recorded reasons for scores below 90', () => {
    expect(
      getQualityWarningCopy({
        modelName: 'summary-model',
        provider: 'external_model',
        qualityScore: 86,
        qualityWarnings: ['证据引用不足', '存在长段落'],
        stage: 'completed',
      }),
    ).toEqual({
      score: 86,
      reasons: ['证据引用不足', '存在长段落'],
    });
  });

  it('does not warn at or above the threshold and has an honest fallback', () => {
    expect(
      getQualityWarningCopy({
        modelName: 'summary-model',
        provider: 'builtin',
        qualityScore: 90,
        stage: 'completed',
      }),
    ).toBeNull();
    expect(
      getQualityWarningCopy({
        modelName: 'summary-model',
        provider: 'builtin',
        qualityScore: 72,
        stage: 'completed',
      })?.reasons,
    ).toEqual([
      '系统未返回更细分的预警项，请重点核对原文覆盖度、证据引用和数字信息。',
    ]);
  });
});
