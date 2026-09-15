import { BadRequestException, Injectable } from '@nestjs/common';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { getLocalRuntimePaths } from '../../common/utils/local-runtime-paths';
import type {
  SetupEnvironmentResponse,
  SetupModelValidationResponse,
  SetupRequiredAction,
  SetupStatusResponse,
  SetupValidationKind,
} from '@shared/api.interface';
import { NoteJobsService } from '../note-jobs/note-jobs.service';
import { ModelProviderSettingsService } from '../note-jobs/model-provider-settings.service';
import { TencentAsrSettingsService } from '../note-jobs/tencent-asr-settings.service';
import { RuntimeRegistryService } from '../runtime/runtime.registry.service';
import {
  buildSetupRequiredActions,
  getRequiredEnvironmentChecks,
} from './setup-requirements.utils';
import {
  SetupStateService,
  type StoredSetupState,
  type StoredSetupValidation,
} from './setup-state.service';

function findValidation(
  state: StoredSetupState,
  kind: SetupValidationKind,
): StoredSetupValidation | undefined {
  return state.validations.find(
    (validation: StoredSetupValidation): boolean => validation.kind === kind,
  );
}

function hasCurrentValidation(
  validation: StoredSetupValidation | undefined,
  fingerprint?: string,
): boolean {
  return Boolean(
    validation?.status === 'success' &&
      validation.configFingerprint &&
      fingerprint &&
      validation.configFingerprint === fingerprint,
  );
}

@Injectable()
export class SetupService {
  constructor(
    private readonly setupStateService: SetupStateService,
    private readonly noteJobsService: NoteJobsService,
    private readonly modelProviderSettingsService: ModelProviderSettingsService,
    private readonly tencentAsrSettingsService: TencentAsrSettingsService,
    private readonly runtimeRegistryService: RuntimeRegistryService,
  ) {}

  async getStatus(): Promise<SetupStatusResponse> {
    const [state, aiModelSettings, readiness, storageReady] =
      await Promise.all([
        this.setupStateService.get(),
        this.modelProviderSettingsService.getPublicSettings(),
        this.noteJobsService.getReadiness(),
        this.checkStorage(),
      ]);
    const [summaryFingerprint, transcriptionFingerprint] = await Promise.all([
      this.modelProviderSettingsService.getConfigurationFingerprint('llm'),
      this.modelProviderSettingsService.getConfigurationFingerprint(
        'transcription',
      ),
    ]);
    const requiredActions: SetupRequiredAction[] = buildSetupRequiredActions({
      aiModelSettings,
      readiness,
      selectedCapabilities: state.selectedCapabilities,
      storageReady,
    });
    const summaryValidation: StoredSetupValidation | undefined = findValidation(
      state,
      'summary',
    );
    const transcriptionValidation: StoredSetupValidation | undefined =
      findValidation(state, 'transcription');
    const storageValidation: StoredSetupValidation | undefined = findValidation(
      state,
      'storage',
    );

    if (
      aiModelSettings.summaryModel &&
      !hasCurrentValidation(summaryValidation, summaryFingerprint)
    ) {
      requiredActions.push({ action: 'configure_summary', label: '验证总结模型' });
    }
    const needsTranscription: boolean = state.selectedCapabilities.some(
      (capability): boolean =>
        capability === 'local_audio' ||
        capability === 'local_video' ||
        capability === 'recording' ||
        capability === 'platform_video',
    );
    if (
      needsTranscription &&
      aiModelSettings.transcriptionMode === 'custom_api' &&
      aiModelSettings.transcriptionModel &&
      !hasCurrentValidation(transcriptionValidation, transcriptionFingerprint)
    ) {
      requiredActions.push({
        action: 'configure_transcription',
        capability: 'local_audio',
        label: '验证语音转文字',
      });
    }
    if (
      needsTranscription &&
      aiModelSettings.transcriptionMode === 'tencent_asr' &&
      readiness.tencentAsr &&
      !hasCurrentValidation(
        transcriptionValidation,
        await this.tencentAsrSettingsService.getConfigurationFingerprint(),
      )
    ) {
      requiredActions.push({
        action: 'configure_transcription',
        capability: 'local_audio',
        label: '验证腾讯云语音转文字',
      });
    }
    if (
      storageReady &&
      !hasCurrentValidation(storageValidation, 'local-storage-ready')
    ) {
      requiredActions.push({ action: 'repair_storage', label: '验证本机数据保存' });
    }

    const uniqueActions: SetupRequiredAction[] = requiredActions.filter(
      (action: SetupRequiredAction, index: number): boolean =>
        requiredActions.findIndex(
          (candidate: SetupRequiredAction): boolean =>
            candidate.action === action.action,
        ) === index,
    );
    const shouldRepair: boolean =
      state.status === 'completed' &&
      uniqueActions.some(
        (action: SetupRequiredAction): boolean => action.action === 'repair_storage',
      );
    const status = shouldRepair ? 'needs_repair' : state.status;
    return {
      completedAt: state.completedAt,
      completedSteps: state.completedSteps,
      currentStep: state.currentStep,
      migratedFromLegacy:
        state.migratedFromLegacy ||
        (state.status === 'not_started' && aiModelSettings.providers.length > 0),
      requiredActions: uniqueActions,
      selectedCapabilities: state.selectedCapabilities,
      status,
      validations: state.validations,
    };
  }

  async updateProgress(input: {
    currentStep: SetupStatusResponse['currentStep'];
    selectedCapabilities: SetupStatusResponse['selectedCapabilities'];
  }): Promise<SetupStatusResponse> {
    await this.setupStateService.updateProgress(input);
    return this.getStatus();
  }

  async validateEnvironment(): Promise<SetupEnvironmentResponse> {
    const [state, readiness, storageReady] = await Promise.all([
      this.setupStateService.get(),
      this.noteJobsService.getReadiness(),
      this.checkStorage(),
    ]);
    const checks = getRequiredEnvironmentChecks({
      readiness,
      selectedCapabilities: state.selectedCapabilities,
      storageReady,
    });
    await this.setupStateService.recordValidation({
      configFingerprint: storageReady ? 'local-storage-ready' : undefined,
      detail: storageReady
        ? '本机数据目录可读写。'
        : '无法写入本机数据目录。',
      kind: 'storage',
      status: storageReady ? 'success' : 'failed',
      validatedAt: new Date().toISOString(),
    });
    await this.setupStateService.recordValidation({
      detail: checks
        .filter((check) => check.required && check.status === 'unavailable')
        .map((check) => check.label)
        .join('、'),
      kind: 'environment',
      status: checks.some(
        (check): boolean => check.required && check.status === 'unavailable',
      )
        ? 'failed'
        : 'success',
      validatedAt: new Date().toISOString(),
    });
    return { checks, storageReady };
  }

  async validateSummaryModel(input: {
    model: string;
    providerId: string;
  }): Promise<SetupModelValidationResponse> {
    const result: SetupModelValidationResponse =
      await this.modelProviderSettingsService.validateSummaryModel(
        input.providerId,
        input.model,
      );
    const fingerprint: string | undefined =
      await this.modelProviderSettingsService.getConfigurationFingerprint('llm');
    if (!fingerprint) {
      throw new BadRequestException('请先保存当前总结模型配置，再执行验证');
    }
    await this.setupStateService.recordValidation({
      configFingerprint: fingerprint,
      detail: result.message,
      kind: 'summary',
      status: 'success',
      validatedAt: result.checkedAt,
    });
    return result;
  }

  async validateTranscriptionModel(input: {
    model: string;
    providerId: string;
  }): Promise<SetupModelValidationResponse> {
    const result: SetupModelValidationResponse =
      await this.modelProviderSettingsService.validateTranscriptionModel(
        input.providerId,
        input.model,
      );
    const fingerprint: string | undefined =
      await this.modelProviderSettingsService.getConfigurationFingerprint(
        'transcription',
      );
    if (!fingerprint) {
      throw new BadRequestException('请先保存当前转录模型配置，再执行验证');
    }
    await this.setupStateService.recordValidation({
      configFingerprint: fingerprint,
      detail: result.message,
      kind: 'transcription',
      status: 'success',
      validatedAt: result.checkedAt,
    });
    return result;
  }

  async validateTencentAsr(): Promise<{
    asrConnected: boolean;
    checkedAt: string;
    cosConnected: boolean;
    message: string;
  }> {
    const result = await this.tencentAsrSettingsService.testConnection();
    const fingerprint: string | undefined =
      await this.tencentAsrSettingsService.getConfigurationFingerprint();
    const success: boolean = result.asrConnected && result.cosConnected;
    await this.setupStateService.recordValidation({
      configFingerprint: fingerprint,
      detail: result.message,
      kind: 'transcription',
      status: success ? 'success' : 'failed',
      validatedAt: result.checkedAt,
    });
    if (!success) {
      throw new BadRequestException(result.message);
    }
    return result;
  }

  async complete(): Promise<SetupStatusResponse> {
    const status: SetupStatusResponse = await this.getStatus();
    const blockingActions: SetupRequiredAction[] = status.requiredActions.filter(
      (action: SetupRequiredAction): boolean => action.action === 'repair_storage',
    );
    if (blockingActions.length > 0) {
      throw new BadRequestException('本机数据保存尚未就绪，请先修复存储配置');
    }
    await this.setupStateService.markCompleted();
    return this.getStatus();
  }

  async resetProgress(): Promise<SetupStatusResponse> {
    await this.setupStateService.resetProgress();
    return this.getStatus();
  }

  private async checkStorage(): Promise<boolean> {
    const runtime: Awaited<ReturnType<RuntimeRegistryService['getStatus']>> =
      await this.runtimeRegistryService.getStatus();
    if (runtime.storage !== 'local') return true;
    const paths = getLocalRuntimePaths();
    try {
      await mkdir(paths.dataDir, { recursive: true });
      await mkdir(paths.cacheDir, { recursive: true });
      await access(paths.dataDir, constants.W_OK | constants.R_OK);
      await access(paths.cacheDir, constants.W_OK | constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}
