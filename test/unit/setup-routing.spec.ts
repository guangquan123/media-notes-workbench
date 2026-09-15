import {
  buildSetupRedirect,
  getSetupCapabilityForPath,
  getPreviousSetupStep,
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

  it('skips optional connector setup for local note workflows', () => {
    expect(getPreviousSetupStep('review', ['documents'])).toBe('capabilities');
    expect(getPreviousSetupStep('review', ['documents', 'local_video'])).toBe(
      'transcription',
    );
    expect(
      getPreviousSetupStep('review', ['documents', 'external_sync']),
    ).toBe('connector');
    expect(getPreviousSetupStep('connector', ['documents'])).toBe('capabilities');
    expect(getPreviousSetupStep('connector', ['documents', 'local_video'])).toBe(
      'transcription',
    );
    expect(getPreviousSetupStep('provider', ['documents'])).toBe('environment');
  });
});
