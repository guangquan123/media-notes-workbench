import type { NoteSourceType } from '../../shared/api.interface';
import { supportsVisualProcessing } from '../../shared/note-visual-source.utils';

describe('note visual source policy', () => {
  it.each(['platform', 'video', 'paired'] as NoteSourceType[])(
    'enables visual processing for %s',
    (sourceType: NoteSourceType) => {
      expect(supportsVisualProcessing(sourceType)).toBe(true);
    },
  );

  it.each(['audio', 'document', 'pdf'] as NoteSourceType[])(
    'disables visual processing for audio and document class %s',
    (sourceType: NoteSourceType) => {
      expect(supportsVisualProcessing(sourceType)).toBe(false);
    },
  );
});
