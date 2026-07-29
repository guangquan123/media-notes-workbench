import {
  buildVisualWarnings,
  normalizeVisualOptions,
  scoreFrame,
  selectKeyFrames,
  validateFrameSelectionRequest,
} from '../../server/modules/note-jobs/frame-selection.utils';
import type { KeyFrame } from '../../server/modules/note-jobs/frame-extraction.service';

function frame(
  id: string,
  timestamp: number,
  overrides: Partial<KeyFrame> = {},
): KeyFrame {
  return {
    filePath: `/tmp/${id}.png`,
    id,
    sourceFileName: 'lesson.mp4',
    sourceIndex: 0,
    timestamp,
    type: 'interval',
    ...overrides,
  };
}

describe('frame selection', () => {
  it('defaults to skipping image processing until the user explicitly enables it', () => {
    expect(normalizeVisualOptions(undefined)).toEqual({ mode: 'disabled' });
    expect(
      normalizeVisualOptions({
        allowExternalAi: false,
        density: 'standard',
        mode: 'review',
        outputMode: 'original',
      }),
    ).toMatchObject({ allowExternalAi: false, mode: 'review' });
  });

  it('uses scene, uniqueness, visual information and transcript relevance', () => {
    const low = frame('low', 100, {
      sceneScore: 0.1,
      uniquenessScore: 0.1,
      visualInformationScore: 0.1,
    });
    const high = frame('high', 100, {
      sceneScore: 0.9,
      uniquenessScore: 0.9,
      visualInformationScore: 0.9,
      type: 'scene',
    });
    const transcript = [{ start: 90, end: 110, text: '关键结论'.repeat(30) }];
    expect(scoreFrame(high, transcript)).toBeGreaterThan(scoreFrame(low, []));
  });

  it('applies density cap, de-duplicates near timestamps and returns timeline order', () => {
    const frames = Array.from({ length: 40 }, (_, index) =>
      frame(String(index), index * 60, {
        uniquenessScore: index / 40,
        visualInformationScore: 0.8,
      }),
    );
    frames.push(frame('near-duplicate', 61, { visualInformationScore: 1 }));
    const selected = selectKeyFrames(frames, 'standard', 40 * 60);
    expect(selected).toHaveLength(4);
    expect(selected.map((item) => item.timestamp)).toEqual(
      [...selected].map((item) => item.timestamp).sort((a, b) => a - b),
    );
    expect(
      selected.every(
        (item, index) =>
          index === 0 || item.timestamp - selected[index - 1].timestamp >= 12,
      ),
    ).toBe(true);
  });

  it('reports partial visual failures instead of silently swallowing them', () => {
    expect(
      buildVisualWarnings({
        analyzed: 1,
        extracted: 8,
        requestedAi: true,
        selected: 4,
        uploaded: 3,
      }).map((warning) => warning.code),
    ).toEqual(['FRAME_UPLOAD_PARTIAL', 'FRAME_AI_PARTIAL']);
  });

  it('rejects malformed, oversized and invalid frame selections', () => {
    expect(() =>
      validateFrameSelectionRequest({
        orderedFrameIds: undefined,
        revision: 0,
        selectedFrameIds: [],
      } as never),
    ).toThrow('关键帧选择参数不完整');
    expect(() =>
      validateFrameSelectionRequest({
        orderedFrameIds: [],
        revision: -1,
        selectedFrameIds: [],
      }),
    ).toThrow('关键帧选择参数不完整');
    const ids = Array.from({ length: 101 }, (_, index) => `frame-${index}`);
    expect(() =>
      validateFrameSelectionRequest({
        orderedFrameIds: ids,
        revision: 0,
        selectedFrameIds: ids,
      }),
    ).toThrow('单次最多选择 100 张关键帧');
    expect(() =>
      validateFrameSelectionRequest({
        orderedFrameIds: [''],
        revision: 0,
        selectedFrameIds: [''],
      }),
    ).toThrow('关键帧 ID 无效');
  });
});
