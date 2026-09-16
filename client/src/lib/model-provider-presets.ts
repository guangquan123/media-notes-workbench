interface ModelProviderPreset {
  baseUrl: string;
  description: string;
  id: string;
  name: string;
  requiresApiKey: boolean;
}

const MODEL_PROVIDER_PRESETS: readonly ModelProviderPreset[] = [
  {
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI 兼容接口',
    id: 'openai',
    name: 'OpenAI',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://api.deepseek.com/v1',
    description: 'DeepSeek 官方兼容接口',
    id: 'deepseek',
    name: 'DeepSeek',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: '阿里云百炼 OpenAI 兼容接口',
    id: 'qwen',
    name: '阿里云百炼（通义千问）',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    description: '智谱开放平台兼容接口',
    id: 'zhipu',
    name: '智谱 GLM',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    description: '火山方舟 OpenAI 兼容接口',
    id: 'doubao',
    name: '字节火山方舟（豆包）',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://api.moonshot.cn/v1',
    description: 'Moonshot 官方兼容接口，支持 Kimi K3',
    id: 'kimi',
    name: 'Kimi（K3）',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://tokenhub.tencentmaas.com/v1',
    description: '腾讯 TokenHub OpenAI 兼容接口',
    id: 'hunyuan',
    name: '腾讯混元',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://api.siliconflow.cn/v1',
    description: '硅基流动 OpenAI 兼容接口',
    id: 'siliconflow',
    name: '硅基流动',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://qianfan.baidubce.com/v2',
    description: '百度千帆 OpenAI 兼容接口',
    id: 'qianfan',
    name: '百度千帆',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://api.minimaxi.com/v1',
    description: 'MiniMax 国内 OpenAI 兼容接口',
    id: 'minimax',
    name: 'MiniMax',
    requiresApiKey: true,
  },
  {
    baseUrl: 'http://127.0.0.1:11434/v1',
    description: '本机运行，不需要 API Key',
    id: 'ollama',
    name: 'Ollama 本地模型',
    requiresApiKey: false,
  },
  {
    baseUrl: '',
    description: '填写 OpenAI 兼容服务地址',
    id: 'custom',
    name: '其他兼容服务',
    requiresApiKey: true,
  },
];

function findModelProviderPreset(id: string): ModelProviderPreset | undefined {
  return MODEL_PROVIDER_PRESETS.find(
    (preset: ModelProviderPreset): boolean => preset.id === id,
  );
}

function normalizePresetUrl(value: string): string {
  return value.trim().replace(/\/+$/u, '');
}

function inferModelProviderPresetId(baseUrl: string): string {
  const normalizedBaseUrl: string = normalizePresetUrl(baseUrl);
  return (
    MODEL_PROVIDER_PRESETS.find(
      (preset: ModelProviderPreset): boolean =>
        preset.id !== 'custom' &&
        normalizePresetUrl(preset.baseUrl) === normalizedBaseUrl,
    )?.id || 'custom'
  );
}

export {
  findModelProviderPreset,
  inferModelProviderPresetId,
  MODEL_PROVIDER_PRESETS,
};
export type { ModelProviderPreset };
