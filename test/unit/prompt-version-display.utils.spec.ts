import { orderPromptVersions } from '../../client/src/pages/NoteTemplatesPage/prompt-version-display.utils';

describe('prompt version display utilities', () => {
  it('places the active version before older history entries', () => {
    const ordered = orderPromptVersions('version-2', [
      { id: 'version-3', versionNumber: 3 },
      { id: 'version-2', versionNumber: 2 },
      { id: 'version-1', versionNumber: 1 },
    ]);

    expect(ordered.map((item) => item.id)).toEqual([
      'version-2',
      'version-3',
      'version-1',
    ]);
  });
});
