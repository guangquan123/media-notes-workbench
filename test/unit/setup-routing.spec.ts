import {
  buildSetupRedirect,
  getSetupCapabilityForPath,
} from '../../client/src/lib/setup-routing';

describe('setup routing', () => {
  it('maps supported workbench routes to their setup capability', () => {
    expect(getSetupCapabilityForPath('/document-notes')).toBe('documents');
    expect(getSetupCapabilityForPath('/app/app_demo/local-video-notes')).toBe(
      'local_video',
    );
    expect(getSetupCapabilityForPath('/recording-notes')).toBe('recording');
    expect(getSetupCapabilityForPath('/settings')).toBeUndefined();
  });

  it('keeps the full return path and query when redirecting into setup', () => {
    expect(
      buildSetupRedirect('/app/app_demo/audio-notes', '?draft=1', '#upload'),
    ).toBe(
      '/setup?returnTo=%2Fapp%2Fapp_demo%2Faudio-notes%3Fdraft%3D1%23upload&capability=local_audio',
    );
  });
});
