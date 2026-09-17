import type { AiModelSettings, SystemReadiness } from '@shared/api.interface';
import {
  hasAvailableTranscription,
  hasConfiguredModel,
  resolveAvailableTranscriptionProvider,
} from '@shared/model-settings.utils';

interface AiModelReadinessSummary {
  currentSummaryLabel: string;
  currentTranscriptionLabel: string;
  modelsReady: boolean;
  providerReady: boolean;
  summaryReady: boolean;
  transcriptionReady: boolean;
}

function buildAiModelReadinessSummary(
  settings: AiModelSettings,
  readiness: SystemReadiness | null,
  localRuntime: boolean,
): AiModelReadinessSummary {
  const summaryReady: boolean = hasConfiguredModel(settings, 'llm');
  const transcriptionReady: boolean = Boolean(
    readiness && hasAvailableTranscription(readiness),
  );
  const availableTranscriptionProvider = readiness
    ? resolveAvailableTranscriptionProvider(
        readiness,
        settings.transcriptionMode,
      )
    : undefined;
  const generationReady: boolean = summaryReady || !localRuntime;
  const providerReady: boolean =
    !localRuntime ||
    settings.providers.some(
      (provider): boolean => provider.enabled && provider.configured,
    );

  let currentTranscriptionLabel: string;
  if (availableTranscriptionProvider === 'tencent_asr') {
    currentTranscriptionLabel = '腾讯 ASR';
  } else if (availableTranscriptionProvider === 'custom_api') {
    currentTranscriptionLabel = `${settings.transcriptionModel?.providerName || 'API 提供者'} · ${settings.transcriptionModel?.model || '转录模型'}`;
  } else if (availableTranscriptionProvider === 'local_whisper') {
    currentTranscriptionLabel = '本地 Whisper';
  } else {
    currentTranscriptionLabel = '尚未配置可用的转录方式';
  }

  const currentSummaryLabel: string = summaryReady
    ? `${settings.summaryModel?.providerName || 'API 提供者'} · ${settings.summaryModel?.model || '总结模型'}`
    : localRuntime
      ? '尚未配置总结模型'
      : '使用妙搭内置 AI';

  return {
    currentSummaryLabel,
    currentTranscriptionLabel,
    modelsReady: generationReady && transcriptionReady,
    providerReady,
    summaryReady,
    transcriptionReady,
  };
}

export { buildAiModelReadinessSummary };
export type { AiModelReadinessSummary };
