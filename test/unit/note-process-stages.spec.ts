import type {
  NoteSourceType,
  NoteVisualOptions,
} from '../../shared/api.interface';
import { shouldShowVisualProcessingStage } from '../../client/src/utils/note-process-stages';

const enabledVisualOptions: NoteVisualOptions = {
  allowExternalAi: false,
  density: 'standard',
  mode: 'automatic',
  outputMode: 'original',
};

describe('note process visual stage visibility', () => {
  it.each(['platform', 'video', 'paired'] as NoteSourceType[])(
    'shows the visual stage for %s when visual processing is enabled',
    (sourceType: NoteSourceType) => {
      expect(
        shouldShowVisualProcessingStage(sourceType, enabledVisualOptions),
      ).toBe(true);
    },
  );

  it.each(['platform', 'video', 'paired'] as NoteSourceType[])(
    'hides the visual stage for %s when visual processing is disabled',
    (sourceType: NoteSourceType) => {
      expect(
        shouldShowVisualProcessingStage(sourceType, { mode: 'disabled' }),
      ).toBe(false);
    },
  );

  it.each(['audio', 'document', 'pdf'] as NoteSourceType[])(
    'never shows the visual stage for %s',
    (sourceType: NoteSourceType) => {
      expect(
        shouldShowVisualProcessingStage(sourceType, enabledVisualOptions),
      ).toBe(false);
    },
  );
});
