import type {
  AiModelCapability,
  AiModelSettings,
  ModelReference,
  ModelServiceProvider,
  SystemReadiness,
  TranscriptionMode,
  TranscriptionProvider,
} from './api.interface';

type AvailableTranscriptionProvider = Exclude<TranscriptionProvider, 'mixed'>;

function getModelReference(
  settings: AiModelSettings,
  capability: AiModelCapability,
): ModelReference | undefined {
  return capability === 'llm'
    ? settings.summaryModel
    : settings.transcriptionModel;
}

function hasConfiguredModel(
  settings: AiModelSettings | null | undefined,
  capability: AiModelCapability,
): boolean {
  if (!settings) return false;
  const reference: ModelReference | undefined = getModelReference(
    settings,
    capability,
  );
  if (!reference?.model.trim()) return false;
  const provider: ModelServiceProvider | undefined = settings.providers.find(
    (item: ModelServiceProvider): boolean => item.id === reference.providerId,
  );
  return Boolean(provider?.configured && provider.enabled);
}

function hasAvailableTranscription(readiness: SystemReadiness): boolean {
  return Boolean(
    readiness.tencentAsr ||
    readiness.customApiTranscription ||
    (readiness.whisperCli && readiness.whisperModel),
  );
}

function isLocalWhisperReady(readiness: SystemReadiness): boolean {
  return readiness.whisperCli && readiness.whisperModel;
}

function resolveAvailableTranscriptionProvider(
  readiness: SystemReadiness,
  selectedMode: TranscriptionMode,
): AvailableTranscriptionProvider | undefined {
  if (selectedMode === 'custom_api' && readiness.customApiTranscription) {
    return 'custom_api';
  }
  if (selectedMode === 'tencent_asr' && readiness.tencentAsr) {
    return 'tencent_asr';
  }
  if (readiness.customApiTranscription) return 'custom_api';
  if (readiness.tencentAsr) return 'tencent_asr';
  return isLocalWhisperReady(readiness) ? 'local_whisper' : undefined;
}

export {
  hasAvailableTranscription,
  hasConfiguredModel,
  isLocalWhisperReady,
  resolveAvailableTranscriptionProvider,
};
export type { AvailableTranscriptionProvider };
