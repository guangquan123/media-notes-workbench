import { normalizeSetupStatus } from '../../client/src/lib/setup-status';

describe('setup status normalization', () => {
  it('keeps a legacy local setup response usable when optional lists are absent', () => {
    const status = normalizeSetupStatus({
      currentStep: 'welcome',
      status: 'not_started',
    });

    expect(status.completedSteps).toEqual([]);
    expect(status.requiredActions).toEqual([]);
    expect(status.selectedCapabilities).toEqual([]);
    expect(status.validations).toEqual([]);
  });

  it('falls back to a safe first step for an invalid setup response', () => {
    const status = normalizeSetupStatus(null);

    expect(status.currentStep).toBe('welcome');
    expect(status.status).toBe('not_started');
  });
});
