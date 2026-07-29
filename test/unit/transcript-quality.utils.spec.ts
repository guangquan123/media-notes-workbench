import { assessTranscriptQuality } from '../../server/modules/note-jobs/transcript-quality.utils';

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
});
