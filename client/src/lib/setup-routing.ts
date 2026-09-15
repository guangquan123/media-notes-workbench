import type { SetupCapability, SetupStep } from '@shared/api.interface';

const CAPABILITY_ROUTES: ReadonlyArray<{
  capability: SetupCapability;
  pattern: RegExp;
}> = [
  { capability: 'documents', pattern: /(^|\/)(?:document-notes|pdf-notes)(?:\/|$)/u },
  { capability: 'local_audio', pattern: /(^|\/)audio-notes(?:\/|$)/u },
  { capability: 'local_video', pattern: /(^|\/)(?:local-video-notes|paired-media-notes)(?:\/|$)/u },
  { capability: 'recording', pattern: /(^|\/)recording-notes(?:\/|$)/u },
  { capability: 'platform_video', pattern: /(^|\/)video-notes(?:\/|$)/u },
];

export function getSetupCapabilityForPath(
  pathname: string,
): SetupCapability | undefined {
  return CAPABILITY_ROUTES.find(
    ({ pattern }: { capability: SetupCapability; pattern: RegExp }): boolean =>
      pattern.test(pathname),
  )?.capability;
}

export function buildSetupRedirect(
  pathname: string,
  search: string,
  hash: string,
): string {
  const returnTo: string = `${pathname}${search}${hash}`;
  const query = new URLSearchParams({ returnTo });
  const capability: SetupCapability | undefined = getSetupCapabilityForPath(pathname);
  if (capability) query.set('capability', capability);
  return `/setup?${query.toString()}`;
}

export function getPreviousSetupStep(
  currentStep: SetupStep,
  capabilities: SetupCapability[],
): SetupStep | undefined {
  if (currentStep === 'environment') return 'welcome';
  if (currentStep === 'provider') return 'environment';
  if (currentStep === 'capabilities') return 'provider';
  if (currentStep === 'transcription') return 'capabilities';
  if (currentStep === 'connector') {
    const requiresTranscription: boolean = capabilities.some(
      (capability: SetupCapability): boolean =>
        ['local_audio', 'local_video', 'recording', 'platform_video'].includes(
          capability,
        ),
    );
    return requiresTranscription ? 'transcription' : 'capabilities';
  }
  if (currentStep === 'review') {
    if (capabilities.includes('external_sync')) return 'connector';
    const requiresTranscription: boolean = capabilities.some(
      (capability: SetupCapability): boolean =>
        ['local_audio', 'local_video', 'recording', 'platform_video'].includes(
          capability,
        ),
    );
    return requiresTranscription ? 'transcription' : 'capabilities';
  }
  return undefined;
}
