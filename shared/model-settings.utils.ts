import type {
  AiModelCapability,
  AiModelSettings,
  ModelReference,
  ModelServiceProvider,
} from './api.interface';

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

export { hasConfiguredModel };
