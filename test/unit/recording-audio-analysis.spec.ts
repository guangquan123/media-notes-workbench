import {
  buildConservativeAudioAnalysis,
  findSmartPlaybackSkip,
  getSmartPlaybackSummary,
  type AudioActivityFrame,
} from '../../client/src/utils/recording-audio-analysis';

describe('conservative recording audio analysis', () => {
  it('compresses only the protected middle of a long, continuously quiet microphone interval', () => {
    const frames: AudioActivityFrame[] = [
      { endMs: 1_000, peak: 0.08, rms: 0.04, startMs: 0 },
      { endMs: 2_000, peak: 0.01, rms: 0.002, startMs: 1_000 },
      { endMs: 3_000, peak: 0.01, rms: 0.002, startMs: 2_000 },
      { endMs: 4_000, peak: 0.01, rms: 0.002, startMs: 3_000 },
      { endMs: 5_000, peak: 0.01, rms: 0.002, startMs: 4_000 },
      { endMs: 6_000, peak: 0.01, rms: 0.002, startMs: 5_000 },
      { endMs: 7_000, peak: 0.01, rms: 0.002, startMs: 6_000 },
      { endMs: 8_000, peak: 0.07, rms: 0.03, startMs: 7_000 },
    ];

    const analysis = buildConservativeAudioAnalysis({
      captureMode: 'microphone',
      durationMs: 8_000,
      frames,
    });

    expect(analysis.status).toBe('ready');
    expect(analysis.compressibleSegments).toEqual([
      {
        category: 'quiet',
        confidence: 'high',
        id: 'quiet-1',
        sourceEndMs: 6_250,
        sourceStartMs: 1_750,
      },
    ]);
  });

  it('keeps a quiet interval when activity monitoring contains a gap', () => {
    const frames: AudioActivityFrame[] = [
      { endMs: 1_000, peak: 0.01, rms: 0.002, startMs: 0 },
      { endMs: 2_000, peak: 0.01, rms: 0.002, startMs: 1_000 },
      { endMs: 7_000, peak: 0.01, rms: 0.002, startMs: 6_000 },
      { endMs: 8_000, peak: 0.01, rms: 0.002, startMs: 7_000 },
    ];

    const analysis = buildConservativeAudioAnalysis({
      captureMode: 'microphone',
      durationMs: 8_000,
      frames,
    });

    expect(analysis.status).toBe('ready');
    expect(analysis.compressibleSegments).toEqual([]);
    expect(analysis.hasMonitoringGaps).toBe(true);
  });

  it('never auto-compresses computer or mixed audio', () => {
    const frames: AudioActivityFrame[] = Array.from(
      { length: 8 },
      (_value: unknown, index: number) => ({
        endMs: (index + 1) * 1_000,
        peak: 0.002,
        rms: 0.001,
        startMs: index * 1_000,
      }),
    );

    expect(
      buildConservativeAudioAnalysis({
        captureMode: 'system',
        durationMs: 8_000,
        frames,
      }).compressibleSegments,
    ).toEqual([]);
    expect(
      buildConservativeAudioAnalysis({
        captureMode: 'mixed',
        durationMs: 8_000,
        frames,
      }).compressibleSegments,
    ).toEqual([]);
  });

  it('reports smart playback duration and resolves a skip at the source position', () => {
    const segments = [
      {
        category: 'quiet' as const,
        confidence: 'high' as const,
        id: 'quiet-1',
        sourceEndMs: 8_000,
        sourceStartMs: 3_000,
      },
    ];

    expect(getSmartPlaybackSummary(20_000, segments)).toEqual({
      savedDurationMs: 5_000,
      smartDurationMs: 15_000,
    });
    expect(findSmartPlaybackSkip(4_000, segments)).toEqual(segments[0]);
    expect(findSmartPlaybackSkip(8_000, segments)).toBeNull();
  });
});
