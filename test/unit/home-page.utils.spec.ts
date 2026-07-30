import type { NoteVisualOptions } from '../../shared/api.interface';
import { buildPlatformNoteJobRequest } from '../../client/src/pages/HomePage/home-page.utils';

describe('platform note job request', () => {
  it('preserves enabled image processing options for a video link', () => {
    const visualOptions: NoteVisualOptions = {
      allowExternalAi: true,
      density: 'detailed',
      mode: 'automatic',
      outputMode: 'original_with_ai_derivative',
    };

    expect(
      buildPlatformNoteJobRequest({
        cookieBrowser: 'chrome',
        noteStyle: 'learning',
        sourcePlatform: 'bilibili',
        url: 'https://www.bilibili.com/video/BV1example',
        visualOptions,
      }),
    ).toMatchObject({
      cookieBrowser: 'chrome',
      sourcePlatform: 'bilibili',
      sourceType: 'platform',
      visualOptions,
    });
  });
});
