import type { NoteSourceType, NoteVisualOptions } from '@shared/api.interface';
import { supportsVisualProcessing } from '@shared/note-visual-source.utils';

export function shouldShowVisualProcessingStage(
  sourceType: NoteSourceType | undefined,
  visualOptions: NoteVisualOptions | undefined,
): boolean {
  return (
    sourceType !== undefined &&
    supportsVisualProcessing(sourceType) &&
    visualOptions?.mode !== 'disabled'
  );
}
