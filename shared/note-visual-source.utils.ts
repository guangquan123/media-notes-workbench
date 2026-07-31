import type { NoteSourceType } from './api.interface';

const NON_VISUAL_SOURCE_TYPES: readonly NoteSourceType[] = [
  'audio',
  'document',
  'pdf',
];

export function supportsVisualProcessing(
  sourceType: NoteSourceType | undefined,
): boolean {
  return Boolean(sourceType && !NON_VISUAL_SOURCE_TYPES.includes(sourceType));
}
