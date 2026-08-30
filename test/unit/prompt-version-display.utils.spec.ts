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

  it('sorts non-active versions by published time descending', () => {
    const ordered = orderPromptVersions(undefined, [
      {
        id: 'version-1',
        versionNumber: 1,
        publishedAt: '2026-08-18T10:00:00Z',
      },
      {
        id: 'version-3',
        versionNumber: 3,
        publishedAt: '2026-08-20T10:00:00Z',
      },
      {
        id: 'version-2',
        versionNumber: 2,
        publishedAt: '2026-08-19T10:00:00Z',
      },
    ]);

    expect(ordered.map((item) => item.id)).toEqual([
      'version-3',
      'version-2',
      'version-1',
    ]);
  });
});
