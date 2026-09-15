import type {
  SetupStatusResponse,
  SetupStep,
  SetupStatus,
} from '@shared/api.interface';

const SETUP_STEPS: readonly SetupStep[] = [
  'welcome',
  'environment',
  'provider',
  'capabilities',
  'transcription',
  'connector',
  'review',
];

const SETUP_STATUSES: readonly SetupStatus[] = [
  'not_started',
  'in_progress',
  'validating',
  'completed',
  'needs_repair',
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Older local runtimes can return a setup state created before capability and
 * validation lists were introduced. Normalize at the API boundary so a route
 * redirect cannot crash before the user can repair that state.
 */
export function normalizeSetupStatus(value: unknown): SetupStatusResponse {
  const status = asRecord(value);
  return {
    ...status,
    completedSteps: Array.isArray(status.completedSteps)
      ? (status.completedSteps as SetupStep[])
      : [],
    currentStep: SETUP_STEPS.includes(status.currentStep as SetupStep)
      ? (status.currentStep as SetupStep)
      : 'welcome',
    migratedFromLegacy: status.migratedFromLegacy === true,
    requiredActions: Array.isArray(status.requiredActions)
      ? status.requiredActions
      : [],
    selectedCapabilities: Array.isArray(status.selectedCapabilities)
      ? status.selectedCapabilities
      : [],
    skippedSteps: Array.isArray(status.skippedSteps)
      ? (status.skippedSteps as SetupStep[])
      : [],
    status: SETUP_STATUSES.includes(status.status as SetupStatus)
      ? (status.status as SetupStatus)
      : 'not_started',
    validations: Array.isArray(status.validations) ? status.validations : [],
  } as SetupStatusResponse;
}
