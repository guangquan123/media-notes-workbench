import {
  assessTranscriptQuality,
  formatTranscriptQualityWarnings,
} from '../../server/modules/note-jobs/transcript-quality.utils';

describe('transcript quality', () => {
  it('requires review when the transcript contains a long filler-only run', () => {
    expect(
      assessTranscriptQuality('我们先说明项目范围。嗯，嗯，嗯，嗯，嗯，嗯，嗯，嗯，嗯，嗯。'),
    ).toMatchObject({ requiresReview: true });
  });

  it('requires review when a four-character phrase repeats excessively', () => {
    expect(
      assessTranscriptQuality(
        Array.from({ length: 12 }, () => '这个流程需要确认。').join('\n'),
      ),
    ).toMatchObject({ requiresReview: true });
  });

  it('accepts ordinary connected Chinese speech', () => {
    expect(
      assessTranscriptQuality(
        '本次培训介绍项目投标、报价评审和交付协同。报价提交前需要核对成本、权限与风险。',
      ),
    ).toEqual({ requiresReview: false, warnings: [] });
  });

  it('reports a possible issue without making the transcript unusable', () => {
    const result = assessTranscriptQuality(
      Array.from({ length: 12 }, () => '这个流程需要确认。').join('\n'),
    );

    expect(result).toMatchObject({ requiresReview: true });
    expect(result.warnings).toContain(
      '检测到高频重复短语，可能存在转录重复或幻觉',
    );
  });

  it.each([
    ['录音', '本次录音讨论了项目范围、成本和后续行动。'],
    ['视频', '本节视频讲解了数据治理项目的验收标准。'],
    ['视频和录音混合', '混合素材已经完成对齐，并保留了双方的原始表达。'],
  ])(
    'passes a non-empty no-risk warning to the reviewer for %s',
    (_sourceType: string, transcript: string) => {
      const result = assessTranscriptQuality(transcript);

      expect(formatTranscriptQualityWarnings(result.warnings)).toBe(
        '未检测到转录质量风险。',
      );
    },
  );

  it('preserves detected warnings for the reviewer', () => {
    expect(
      formatTranscriptQualityWarnings([
        '检测到高频重复短语，可能存在转录重复或幻觉',
        '检测到连续语气词，可能存在静音或识别异常',
      ]),
    ).toBe(
      '检测到高频重复短语，可能存在转录重复或幻觉；检测到连续语气词，可能存在静音或识别异常',
    );
  });
});
