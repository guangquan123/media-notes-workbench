import { Injectable, Logger, Optional } from '@nestjs/common';
import { readFile, rename } from 'node:fs/promises';
import { getLocalConfigPath } from '../../common/utils/local-runtime-paths';
import { writeLocalTextFile } from '../../common/utils/local-file-write';
import type {
  SetupCapability,
  SetupStatus,
  SetupStep,
  SetupValidationKind,
  SetupValidationStatus,
} from '@shared/api.interface';
import { isSetupCapability } from './setup-requirements.utils';

export interface StoredSetupValidation {
  configFingerprint?: string;
  detail?: string;
  kind: SetupValidationKind;
  status: SetupValidationStatus;
  validatedAt?: string;
}

export interface StoredSetupState {
  completedAt?: string;
  completedSteps: SetupStep[];
  currentStep: SetupStep;
  migratedFromLegacy: boolean;
  schemaVersion: 2;
  selectedCapabilities: SetupCapability[];
  skippedSteps: SetupStep[];
  status: SetupStatus;
  updatedAt: string;
  validations: StoredSetupValidation[];
}

const SETUP_FILE_NAME = '.setup-state.json';
const SETUP_STEPS: readonly SetupStep[] = [
  'welcome',
  'environment',
  'provider',
  'capabilities',
  'transcription',
  'connector',
  'review',
];
const VALIDATION_KINDS: readonly SetupValidationKind[] = [
  'environment',
  'storage',
  'summary',
  'transcription',
  'connector',
];

function createDefaultState(): StoredSetupState {
  return {
    completedSteps: [],
    currentStep: 'welcome',
    migratedFromLegacy: false,
    schemaVersion: 2,
    selectedCapabilities: [],
    skippedSteps: [],
    status: 'not_started',
    updatedAt: new Date().toISOString(),
    validations: [],
  };
}

function isSetupStatus(value: unknown): value is SetupStatus {
  return (
    value === 'not_started' ||
    value === 'in_progress' ||
    value === 'validating' ||
    value === 'completed' ||
    value === 'needs_repair'
  );
}

function isSetupStep(value: unknown): value is SetupStep {
  return typeof value === 'string' && SETUP_STEPS.includes(value as SetupStep);
}

function isValidationKind(value: unknown): value is SetupValidationKind {
  return (
    typeof value === 'string' &&
    VALIDATION_KINDS.includes(value as SetupValidationKind)
  );
}

function isValidationStatus(value: unknown): value is SetupValidationStatus {
  return value === 'pending' || value === 'success' || value === 'failed';
}

function normalizeState(input: unknown): StoredSetupState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return createDefaultState();
  }
  const record: Record<string, unknown> = input as Record<string, unknown>;
  const capabilities: SetupCapability[] = Array.isArray(record.selectedCapabilities)
    ? record.selectedCapabilities.filter(isSetupCapability)
    : [];
  const validations: StoredSetupValidation[] = Array.isArray(record.validations)
    ? record.validations.flatMap(
        (value: unknown): StoredSetupValidation[] => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return [];
          }
          const validation: Record<string, unknown> = value as Record<string, unknown>;
          if (
            !isValidationKind(validation.kind) ||
            !isValidationStatus(validation.status)
          ) {
            return [];
          }
          return [
            {
              configFingerprint:
                typeof validation.configFingerprint === 'string'
                  ? validation.configFingerprint
                  : undefined,
              detail:
                typeof validation.detail === 'string'
                  ? validation.detail.slice(0, 500)
                  : undefined,
              kind: validation.kind,
              status: validation.status,
              validatedAt:
                typeof validation.validatedAt === 'string'
                  ? validation.validatedAt
                  : undefined,
            },
          ];
        },
      )
    : [];
  return {
    completedAt:
      typeof record.completedAt === 'string' ? record.completedAt : undefined,
    completedSteps: Array.isArray(record.completedSteps)
      ? record.completedSteps.filter(isSetupStep)
      : [],
    currentStep: isSetupStep(record.currentStep) ? record.currentStep : 'welcome',
    migratedFromLegacy: record.migratedFromLegacy === true,
    schemaVersion: 2,
    selectedCapabilities: Array.from(new Set(capabilities)),
    skippedSteps: Array.isArray(record.skippedSteps)
      ? Array.from(new Set(record.skippedSteps.filter(isSetupStep)))
      : [],
    status: isSetupStatus(record.status) ? record.status : 'not_started',
    updatedAt: typeof record.updatedAt === 'string'
      ? record.updatedAt
      : new Date().toISOString(),
    validations,
  };
}

@Injectable()
export class SetupStateService {
  private readonly logger = new Logger(SetupStateService.name);
  private readonly statePath: string;
  private current: StoredSetupState | undefined;

  constructor(@Optional() statePath?: string) {
    this.statePath = statePath || getLocalConfigPath(SETUP_FILE_NAME);
  }

  async get(): Promise<StoredSetupState> {
    if (this.current) return this.current;
    try {
      const content: string = await readFile(this.statePath, 'utf8');
      this.current = normalizeState(JSON.parse(content));
      return this.current;
    } catch (error) {
      const code: string | undefined =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : undefined;
      if (code !== 'ENOENT') await this.backupCorruptedState();
      this.current = createDefaultState();
      return this.current;
    }
  }

  async updateProgress(input: {
    currentStep: SetupStep;
    selectedCapabilities: SetupCapability[];
    skippedStep?: SetupStep;
  }): Promise<StoredSetupState> {
    const current: StoredSetupState = await this.get();
    const stepIndex: number = SETUP_STEPS.indexOf(input.currentStep);
    // Moving forward without an explicit skip means the step we just left
    // has now been completed. Clear an older skip marker so a later repair
    // or revisit is reflected accurately in persisted setup state.
    const revisitedStep: SetupStep | undefined =
      input.skippedStep === undefined &&
      stepIndex > SETUP_STEPS.indexOf(current.currentStep)
        ? current.currentStep
        : undefined;
    const skippedSteps: SetupStep[] = Array.from(
      new Set(current.skippedSteps.filter((step) => step !== revisitedStep)),
    );
    if (input.skippedStep) skippedSteps.push(input.skippedStep);
    const completedSteps: SetupStep[] = SETUP_STEPS.slice(0, stepIndex).filter(
      (step: SetupStep): boolean => !skippedSteps.includes(step),
    );
    const selectedCapabilities: SetupCapability[] =
      input.skippedStep === 'connector'
        ? input.selectedCapabilities.filter(
            (capability: SetupCapability): boolean =>
              capability !== 'external_sync',
          )
        : input.selectedCapabilities;
    return this.save({
      ...current,
      completedSteps,
      currentStep: input.currentStep,
      selectedCapabilities: Array.from(new Set(selectedCapabilities)),
      skippedSteps,
      status: 'in_progress',
    });
  }

  async recordValidation(input: StoredSetupValidation): Promise<StoredSetupState> {
    const current: StoredSetupState = await this.get();
    const remaining: StoredSetupValidation[] = current.validations.filter(
      (validation: StoredSetupValidation): boolean => validation.kind !== input.kind,
    );
    return this.save({
      ...current,
      validations: [...remaining, input],
    });
  }

  async markCompleted(): Promise<StoredSetupState> {
    const current: StoredSetupState = await this.get();
    return this.save({
      ...current,
      completedAt: new Date().toISOString(),
      completedSteps: SETUP_STEPS.filter(
        (step: SetupStep): boolean => !current.skippedSteps.includes(step),
      ),
      currentStep: 'review',
      status: 'completed',
    });
  }

  async markNeedsRepair(): Promise<StoredSetupState> {
    const current: StoredSetupState = await this.get();
    return this.save({ ...current, status: 'needs_repair' });
  }

  async resetProgress(): Promise<StoredSetupState> {
    return this.save(createDefaultState());
  }

  private async backupCorruptedState(): Promise<void> {
    const backupPath: string = `${this.statePath}.corrupt-${Date.now()}`;
    try {
      await rename(this.statePath, backupPath);
      this.logger.warn(`首次引导状态文件无法解析，已备份为 ${backupPath}`);
    } catch (error) {
      const message: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`首次引导状态文件无法备份：${message}`);
    }
  }

  private async save(state: StoredSetupState): Promise<StoredSetupState> {
    const next: StoredSetupState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    await writeLocalTextFile(
      this.statePath,
      `${JSON.stringify(next, null, 2)}\n`,
    );
    this.current = next;
    return next;
  }
}

export { SETUP_FILE_NAME };
