import type {
  CreateNoteJobRequest,
  NoteStyle,
  NoteVisualOptions,
  SourcePlatform,
} from '@shared/api.interface';

export interface PlatformNoteJobRequestInput {
  cookieBrowser?: 'chrome' | 'safari' | 'edge' | 'firefox';
  noteStyle: NoteStyle;
  sourcePlatform: SourcePlatform;
  url: string;
  visualOptions: NoteVisualOptions;
}

export function buildPlatformNoteJobRequest(
  input: PlatformNoteJobRequestInput,
): CreateNoteJobRequest {
  return {
    cookieBrowser: input.cookieBrowser,
    noteStyle: input.noteStyle,
    sourcePlatform: input.sourcePlatform,
    sourceType: 'platform',
    url: input.url,
    visualOptions: input.visualOptions,
  };
}
