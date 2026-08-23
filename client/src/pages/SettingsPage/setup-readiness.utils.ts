import type {
  ConnectorSettingsResponse,
  ExternalModelSettings,
  RuntimeStatus,
  SystemReadiness,
  TencentAsrSettings,
} from '@shared/api.interface';

export type SetupActionSection =
  | 'connectors'
  | 'model'
  | 'transcription';

export type SetupCapabilityStatus = 'action' | 'optional' | 'ready';
export type SetupOverallStatus = 'blocked' | 'partial' | 'ready';

export interface SetupCapabilityItem {
  actionLabel?: string;
  actionSection?: SetupActionSection;
  description: string;
  details: string[];
  id:
    | 'connector'
    | 'documents'
    | 'local-media'
    | 'model'
    | 'platform-media';
  label: string;
  required: boolean;
  status: SetupCapabilityStatus;
}

export interface SetupReadinessInput {
  connectors: ConnectorSettingsResponse | null;
  externalModel: ExternalModelSettings | null;
  readiness: SystemReadiness;
  runtime: RuntimeStatus | null;
  tencentAsr: TencentAsrSettings | null;
}

export interface SetupReadinessResult {
  availableSourceLabels: string[];
  headline: string;
  items: SetupCapabilityItem[];
  status: SetupOverallStatus;
  summary: string;
}

const CONNECTOR_LABELS: Record<string, string> = {
  dingtalk: '钉钉',
  feishu: '飞书',
};

function getConnectorLabel(input: SetupReadinessInput): string {
  const type =
    input.connectors?.activeConnector || input.readiness.connectorType;
  const descriptor = input.connectors?.items?.find((item) => item.type === type);
  return descriptor?.label || (type ? CONNECTOR_LABELS[type] || type : '当前');
}

function buildTranscriptionDetails(input: SetupReadinessInput): string[] {
  const details: string[] = [];
  if (!input.readiness.ffmpeg) {
    details.push('未检测到 ffmpeg：本地音视频需要它提取和处理音轨。');
  }
  if (!input.readiness.tencentAsr && !input.readiness.whisperCli) {
    details.push('未检测到 whisper-cli，可在“转录引擎”中改用腾讯云 ASR。');
  } else if (!input.readiness.tencentAsr && !input.readiness.whisperModel) {
    details.push('已检测到 whisper-cli，但缺少本地 Whisper 模型文件。');
  }
  if (
    input.tencentAsr?.enabled &&
    (!input.tencentAsr.configured || !input.readiness.tencentAsr)
  ) {
    details.push('腾讯云 ASR 已开启，但凭证、存储桶或连接状态尚未就绪。');
  }
  if (input.readiness.tencentAsr) {
    details.push('当前使用腾讯云 ASR，无需安装本地 Whisper。');
  } else if (input.readiness.whisperCli && input.readiness.whisperModel) {
    details.push('当前使用本地 Whisper，无需配置腾讯云账号。');
  }
  return details;
}

export function buildSetupReadiness(
  input: SetupReadinessInput,
): SetupReadinessResult {
  const connectorReady = Boolean(
    input.readiness.connectorReady ?? input.readiness.larkCli,
  );
  const connectorLabel = getConnectorLabel(input);
  const transcriptionReady = Boolean(
    input.readiness.tencentAsr ||
    (input.readiness.whisperCli && input.readiness.whisperModel),
  );
  const localMediaReady = Boolean(
    connectorReady && input.readiness.ffmpeg && transcriptionReady,
  );
  const documentReady = Boolean(
    connectorReady && input.readiness.documentReady,
  );
  const platformMediaReady = Boolean(localMediaReady && input.readiness.ytDlp);
  const runtimeKnown = Boolean(input.runtime);
  const externalModelReady = Boolean(
    input.externalModel?.enabled && input.externalModel.configured,
  );
  const externalModelRequired = input.runtime?.mode === 'local';
  const generationReady = Boolean(
    runtimeKnown && (!externalModelRequired || externalModelReady),
  );
  const documentSourceReady = Boolean(documentReady && generationReady);
  const localMediaSourceReady = Boolean(localMediaReady && generationReady);
  const platformMediaSourceReady = Boolean(
    platformMediaReady && generationReady,
  );
  const availableSourceLabels = [
    documentSourceReady ? '文档资料' : '',
    localMediaSourceReady ? '本地音视频' : '',
    platformMediaSourceReady ? '平台视频链接' : '',
  ].filter(Boolean);

  const localMediaActionSection: SetupActionSection = !connectorReady
    ? 'connectors'
    : !localMediaReady
      ? 'transcription'
      : 'model';
  const localMediaActionLabel =
    localMediaActionSection === 'connectors'
      ? '配置输出位置'
      : localMediaActionSection === 'model'
        ? '配置总结模型'
        : '配置转录引擎';
  const documentActionSection: SetupActionSection = connectorReady
    ? 'model'
    : 'connectors';
  const documentActionLabel = connectorReady ? '配置总结模型' : '配置输出位置';

  const modelItem: SetupCapabilityItem = !runtimeKnown
    ? {
        id: 'model',
        label: '总结模型',
        description:
          '暂时无法确认当前运行模式，请刷新自检后再判断是否需要配置外部模型。',
        details: ['运行模式接口读取失败，自检不会据此猜测模型可用性。'],
        required: true,
        status: 'action',
        actionLabel: '检查模型配置',
        actionSection: 'model',
      }
    : externalModelRequired
      ? {
          id: 'model',
          label: '总结模型',
          description: externalModelReady
            ? `本地模式已启用 ${input.externalModel?.model || '外部模型'}。`
            : '本地模式需要一个 OpenAI 兼容模型，完成转录后才能生成笔记。',
          details: externalModelReady
            ? ['API Key 仅以脱敏状态读取。']
            : [
                input.externalModel?.enabled
                  ? '外部模型已开启，但 API 地址、模型名或 API Key 尚未完整配置。'
                  : '当前未启用外部模型；本地模式没有内置模型兜底。',
              ],
          required: true,
          status: externalModelReady ? 'ready' : 'action',
          actionLabel: externalModelReady ? undefined : '配置总结模型',
          actionSection: externalModelReady ? undefined : 'model',
        }
      : {
          id: 'model',
          label: '总结模型',
          description: externalModelReady
            ? `已启用 ${input.externalModel?.model || '外部模型'}，生成失败时仍可回退内置模型。`
            : '当前使用平台内置模型；外部模型属于可选增强。',
          details: input.externalModel
            ? ['不配置外部 API Key 也不影响基础使用。']
            : ['模型设置读取失败，不影响平台内置模型。'],
          required: false,
          status: externalModelReady ? 'ready' : 'optional',
          actionLabel: externalModelReady ? undefined : '按需配置',
          actionSection: externalModelReady ? undefined : 'model',
        };

  const items: SetupCapabilityItem[] = [
    {
      id: 'connector',
      label: '笔记输出位置',
      description: connectorReady
        ? `${connectorLabel}连接器已就绪，生成结果有明确保存位置。`
        : '当前输出连接器未就绪，任务无法可靠保存结果。',
      details: connectorReady
        ? [`当前结果将同步到${connectorLabel}。`]
        : ['请先完成飞书或钉钉连接器授权。'],
      required: true,
      status: connectorReady ? 'ready' : 'action',
      actionLabel: connectorReady ? undefined : '选择输出位置',
      actionSection: connectorReady ? undefined : 'connectors',
    },
    modelItem,
    {
      id: 'local-media',
      label: '本地音视频',
      description: localMediaSourceReady
        ? '音频、视频和双机位资料的处理链路已就绪。'
        : localMediaReady
          ? '音视频处理链路已就绪，仍需完成总结模型配置。'
          : '还缺少输出位置、音视频处理组件或可用的转录引擎。',
      details: [
        ...buildTranscriptionDetails(input),
        ...(localMediaReady && !generationReady
          ? ['转录完成后仍需可用的总结模型，才能生成最终笔记。']
          : []),
      ],
      required: true,
      status: localMediaSourceReady ? 'ready' : 'action',
      actionLabel: localMediaSourceReady ? undefined : localMediaActionLabel,
      actionSection: localMediaSourceReady
        ? undefined
        : localMediaActionSection,
    },
    {
      id: 'documents',
      label: '文档资料',
      description: documentSourceReady
        ? 'PDF、Word、PPT 和文本资料可直接生成笔记。'
        : documentReady
          ? '文档解析和输出位置已就绪，仍需完成总结模型配置。'
          : '文档解析可用，但需要先完成输出连接器配置。',
      details: [
        '文档入口不依赖 ffmpeg、yt-dlp 或语音转录引擎。',
        ...(documentReady && !generationReady
          ? ['仍需可用的总结模型，才能生成最终笔记。']
          : []),
      ],
      required: true,
      status: documentSourceReady ? 'ready' : 'action',
      actionLabel: documentSourceReady ? undefined : documentActionLabel,
      actionSection: documentSourceReady ? undefined : documentActionSection,
    },
    {
      id: 'platform-media',
      label: '平台视频链接',
      description: platformMediaSourceReady
        ? '哔哩哔哩、抖音等平台链接可直接处理。'
        : platformMediaReady
          ? '平台下载和转录链路已就绪，仍需完成总结模型配置。'
          : '这是按需能力；缺失不会影响本地文件和文档资料。',
      details: [
        ...(!input.readiness.ytDlp
          ? ['未检测到 yt-dlp：安装后重启应用即可启用平台视频下载。']
          : []),
        ...(!localMediaReady
          ? ['平台视频仍会复用本地音视频的 ffmpeg 与转录链路。']
          : []),
        ...(platformMediaReady && !generationReady
          ? ['仍需可用的总结模型，才能生成最终笔记。']
          : []),
      ],
      required: false,
      status: platformMediaSourceReady ? 'ready' : 'optional',
    },
  ];

  const coreReady = Boolean(
    connectorReady && localMediaSourceReady && documentSourceReady,
  );
  if (coreReady) {
    return {
      availableSourceLabels,
      headline: '核心能力已就绪',
      items,
      status: 'ready',
      summary: '可以直接处理本地音视频和文档；平台链接按需启用。',
    };
  }
  if (availableSourceLabels.length > 0) {
    return {
      availableSourceLabels,
      headline: '可以开始使用，部分能力待补齐',
      items,
      status: 'partial',
      summary: `${availableSourceLabels.length} 类资料入口已可用，未就绪项不会被隐藏。`,
    };
  }
  return {
    availableSourceLabels,
    headline: '完成关键配置后即可开始',
    items,
    status: 'blocked',
    summary: '请先处理标记为“需要配置”的项目；按需能力可以稍后再设置。',
  };
}
