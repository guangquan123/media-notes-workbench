import {
  buildEnergyEnvelope,
  estimateAudioAlignment,
  fuseTranscriptSegments,
  parseWhisperJson,
} from '../../server/modules/note-jobs/paired-media.utils';

describe('paired media evidence utilities', () => {
  it('builds a normalized energy envelope from signed PCM samples', () => {
    const samples: Int16Array = new Int16Array([
      100,
      -100,
      100,
      -100,
      1000,
      -1000,
      1000,
      -1000,
    ]);

    const envelope = buildEnergyEnvelope(samples, 4, 1_000);

    expect(envelope).toHaveLength(2);
    expect(envelope[1]).toBeGreaterThan(envelope[0]);
  });

  it('finds when auxiliary audio starts later than the video', () => {
    const videoEnvelope = [
      0, 0, 2, 7, 1, 5, 0, 9, 3, 0, 4, 8, 1, 0, 6, 2,
    ];
    const auxiliaryEnvelope = videoEnvelope.slice(4, 14);

    const alignment = estimateAudioAlignment(
      videoEnvelope,
      auxiliaryEnvelope,
      1_000,
      8_000,
    );

    expect(alignment.audioOffsetMs).toBe(4_000);
    expect(alignment.status).toBe('aligned');
    expect(alignment.score).toBeGreaterThan(0.9);
  });

  it('marks unrelated recordings as needing manual review', () => {
    const alignment = estimateAudioAlignment(
      [0, 8, 0, 8, 0, 8, 0, 8],
      [2, 2, 2, 2, 2, 2],
      1_000,
      4_000,
    );

    expect(alignment.status).toBe('needs_review');
  });

  it('parses timestamped whisper JSON segments', () => {
    const segments = parseWhisperJson(
      JSON.stringify({
        transcription: [
          {
            timestamps: { from: '00:00:01,000', to: '00:00:03,500' },
            text: ' 第一条结论 ',
          },
          {
            offsets: { from: 3500, to: 6200 },
            text: '第二条结论',
          },
        ],
      }),
    );

    expect(segments).toEqual([
      { startMs: 1_000, endMs: 3_500, text: '第一条结论' },
      { startMs: 3_500, endMs: 6_200, text: '第二条结论' },
    ]);
  });

  it('uses matching dual transcripts as corroborated evidence', () => {
    const fused = fuseTranscriptSegments({
      audioOffsetMs: 2_000,
      auxiliarySegments: [
        { startMs: 0, endMs: 4_000, text: '项目计划下周一开始执行' },
      ],
      videoSegments: [
        { startMs: 2_000, endMs: 6_000, text: '项目计划下周一开始执行' },
      ],
    });

    expect(fused.markdown).toContain('[双路一致]');
    expect(fused.markdown).toContain('项目计划下周一开始执行');
    expect(fused.conflictCount).toBe(0);
  });

  it('preserves both transcripts when aligned sources conflict', () => {
    const fused = fuseTranscriptSegments({
      audioOffsetMs: 0,
      auxiliarySegments: [
        { startMs: 0, endMs: 5_000, text: '预算是五十万元' },
      ],
      videoSegments: [
        { startMs: 0, endMs: 5_000, text: '预算是五百万元' },
      ],
    });

    expect(fused.markdown).toContain('[待核对]');
    expect(fused.markdown).toContain('辅助录音：预算是五十万元');
    expect(fused.markdown).toContain('视频音轨：预算是五百万元');
    expect(fused.conflictCount).toBe(1);
  });
});
