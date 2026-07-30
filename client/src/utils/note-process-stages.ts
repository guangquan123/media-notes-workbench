import type { NoteSourceType, NoteVisualOptions } from '@shared/api.interface';

const VISUAL_SOURCE_TYPES: readonly NoteSourceType[] = [
  'platform',
  'video',
  'paired',
];

export function shouldShowVisualProcessingStage(
  sourceType: NoteSourceType | undefined,
  visualOptions: NoteVisualOptions | undefined,
): boolean {
  return (
    sourceType !== undefined &&
    VISUAL_SOURCE_TYPES.includes(sourceType) &&
    visualOptions?.mode !== 'disabled'
  );
}
