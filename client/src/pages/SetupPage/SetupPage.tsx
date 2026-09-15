import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Link2,
  LoaderCircle,
  Mic2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Video,
  Waypoints,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  analyzeSetupProviderUrl,
  completeSetup,
  createModelServiceProvider,
  getAiModelSettings,
  getModelProviderModels,
  getTencentAsrSettings,
  getSetupStatus,
  resetSetupProgress,
  updateAiModelSettings,
  updateModelServiceProvider,
  updateSetupProgress,
  updateTencentAsrSettings,
  validateSetupEnvironment,
  validateSetupSummaryModel,
  validateSetupTencentAsr,
  validateSetupTranscriptionModel,
} from '@/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  AiModelSettings,
  ModelProviderModel,
  ModelServiceProvider,
  SetupCapability,
  SetupEnvironmentResponse,
  SetupStatusResponse,
  SetupStep,
  TencentAsrSettings,
  TranscriptionMode,
} from '@shared/api.interface';
import { getPreviousSetupStep } from '@/lib/setup-routing';
import SetupConnectorStep from './SetupConnectorStep';

interface ProviderPreset {
  baseUrl: string;
  id: string;
  name: string;
  requiresApiKey: boolean;
}

const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    baseUrl: 'https://api.openai.com/v1',
    id: 'openai',
    name: 'OpenAI',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://api.deepseek.com/v1',
    id: 'deepseek',
    name: 'DeepSeek',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    id: 'qwen',
    name: '通义千问',
    requiresApiKey: true,
  },
  {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    id: 'zhipu',
    name: '智谱',
    requiresApiKey: true,
  },
  {
    baseUrl: 'http://127.0.0.1:11434/v1',
    id: 'ollama',
    name: 'Ollama 本地模型',
    requiresApiKey: false,
  },
  {
    baseUrl: '',
    id: 'custom',
    name: '其他兼容服务',
    requiresApiKey: true,
  },
];

const SETUP_STEPS: ReadonlyArray<{ id: SetupStep; label: string }> = [
  { id: 'welcome', label: '使用场景' },
  { id: 'environment', label: '环境检查' },
  { id: 'provider', label: 'AI 服务' },
  { id: 'capabilities', label: '处理能力' },
  { id: 'transcription', label: '语音转文字' },
  { id: 'connector', label: '笔记输出' },
  { id: 'review', label: '完成验证' },
];

const CAPABILITIES: ReadonlyArray<{
  description: string;
  id: SetupCapability;
  label: string;
}> = [
  { description: 'PDF、Word、PPT 和文本资料', id: 'documents', label: '文档笔记' },
  { description: '上传录音或音频文件', id: 'local_audio', label: '音频和录音' },
  { description: '上传本地视频文件', id: 'local_video', label: '本地视频' },
  { description: '直接在浏览器录制声音', id: 'recording', label: '直接录音' },
  { description: '处理 B 站、抖音等链接', id: 'platform_video', label: '平台视频链接' },
  { description: '把结果同步到飞书或钉钉', id: 'external_sync', label: '外部同步' },
];

function getApiErrorMessage(value: unknown, depth: number = 0): string {
  if (depth > 3) return '';
  if (typeof value === 'string') {
    const message: string = value.trim();
    if (!message) return '';
    try {
      return getApiErrorMessage(JSON.parse(message), depth + 1) || message;
    } catch {
      return message;
    }
  }
  if (!value || typeof value !== 'object') return '';

  const payload: Record<string, unknown> = value as Record<string, unknown>;
  const candidates: unknown[] = [
    payload.error,
    payload.message,
    payload.detail,
    payload.details,
    payload.errorMessage,
  ];
  for (const candidate of candidates) {
    const message: string = getApiErrorMessage(candidate, depth + 1);
    if (message) return message;
  }
  return '';
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const response: unknown = (error as { response?: unknown }).response;
    const data: unknown =
      response && typeof response === 'object'
        ? (response as { data?: unknown }).data
        : undefined;
    const apiMessage: string = getApiErrorMessage(data);
    if (apiMessage) return apiMessage;
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return '操作失败，请稍后重试。';
}

function getInitialStep(
  status: SetupStatusResponse,
  requestedCapability?: SetupCapability,
): SetupStep {
  // A brand-new install must introduce the flow in order. Once progress
  // exists, resume at the first actionable requirement instead of replaying
  // the welcome step.
  if (
    status.status === 'not_started' &&
    status.completedSteps.length === 0 &&
    !requestedCapability
  ) {
    return 'welcome';
  }
  if (
    requestedCapability &&
    !status.selectedCapabilities.includes(requestedCapability)
  ) {
    return 'welcome';
  }
  const action = status.requiredActions[0]?.action;
  if (action === 'repair_storage') return 'environment';
  if (action === 'configure_summary') return 'provider';
  if (action === 'configure_transcription') return 'transcription';
  if (action === 'configure_connector') return 'connector';
  if (
    status.currentStep === 'connector' &&
    !status.selectedCapabilities.includes('external_sync')
  ) {
    return 'review';
  }
  if (status.status === 'needs_repair') return 'provider';
  return status.currentStep;
}

function getSafeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function uniqueCapabilities(values: SetupCapability[]): SetupCapability[] {
  return Array.from(new Set(values));
}

function getCapabilityFromQuery(value: string | null): SetupCapability | undefined {
  return CAPABILITIES.some(
    (capability): boolean => capability.id === value,
  )
    ? (value as SetupCapability)
    : undefined;
}

function hasMediaCapability(capabilities: SetupCapability[]): boolean {
  return capabilities.some((capability: SetupCapability): boolean =>
    ['local_audio', 'local_video', 'recording', 'platform_video'].includes(
      capability,
    ),
  );
}

const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo: string = getSafeReturnTo(searchParams.get('returnTo'));
  const requestedCapability: SetupCapability | undefined = getCapabilityFromQuery(
    searchParams.get('capability'),
  );
  const [status, setStatus] = useState<SetupStatusResponse | null>(null);
  const [step, setStep] = useState<SetupStep>('welcome');
  const [selectedCapabilities, setSelectedCapabilities] = useState<SetupCapability[]>(() => {
    const requested: SetupCapability | undefined = getCapabilityFromQuery(
      new URLSearchParams(window.location.search).get('capability'),
    );
    return requested ? uniqueCapabilities(['documents', requested]) : ['documents'];
  });
  const [environment, setEnvironment] = useState<SetupEnvironmentResponse | null>(null);
  const [models, setModels] = useState<ModelProviderModel[]>([]);
  const [aiSettings, setAiSettings] = useState<AiModelSettings | null>(null);
  const [providerId, setProviderId] = useState<string>('');
  const [transcriptionProviderId, setTranscriptionProviderId] = useState<string>('');
  const [transcriptionModels, setTranscriptionModels] = useState<ModelProviderModel[]>([]);
  const [transcriptionModel, setTranscriptionModel] = useState<string>('');
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('tencent_asr');
  const [tencentSettings, setTencentSettings] = useState<TencentAsrSettings | null>(null);
  const [tencentForm, setTencentForm] = useState({
    asrRegion: 'ap-guangzhou',
    bucket: '',
    engineModelType: '16k_zh_en_2.0',
    region: 'ap-shanghai',
    secretId: '',
    secretKey: '',
    speakerDiarization: true,
  });
  const [transcriptionLoading, setTranscriptionLoading] = useState<boolean>(false);
  const [providerPresetId, setProviderPresetId] = useState<string>('openai');
  const [providerName, setProviderName] = useState<string>('OpenAI');
  const [baseUrl, setBaseUrl] = useState<string>('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [urlNotice, setUrlNotice] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [working, setWorking] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);
  const environmentValidationInFlight = useRef<boolean>(false);

  const selectedPreset: ProviderPreset = useMemo(
    (): ProviderPreset =>
      PROVIDER_PRESETS.find(
        (preset: ProviderPreset): boolean => preset.id === providerPresetId,
      ) || PROVIDER_PRESETS[0],
    [providerPresetId],
  );
  const visibleCapabilities = useMemo(() => CAPABILITIES, []);
  const requiresExternalSync: boolean = selectedCapabilities.includes(
    'external_sync',
  );

  useEffect((): (() => void) => {
    let mounted = true;
    Promise.all([getSetupStatus(), getAiModelSettings()])
      .then(([nextStatus, nextSettings]: [SetupStatusResponse, AiModelSettings]): void => {
        if (!mounted) return;
        setStatus(nextStatus);
        setStep(getInitialStep(nextStatus, requestedCapability));
        const requested: SetupCapability | undefined = requestedCapability;
        const requestedCapabilities: SetupCapability[] = requested
          ? ['documents', requested]
          : [];
        // A route-specific setup request means the user is enabling that one
        // entry now. Do not revive unrelated capabilities from an incomplete
        // earlier wizard run, or their dependencies become false blockers.
        setSelectedCapabilities(
          requested
            ? requestedCapabilities
            : nextStatus.selectedCapabilities.length > 0
              ? uniqueCapabilities(nextStatus.selectedCapabilities)
              : ['documents'],
        );
        setAiSettings(nextSettings);
        setTranscriptionMode(nextSettings.transcriptionMode);
        setTranscriptionProviderId(nextSettings.transcriptionModel?.providerId || '');
        setTranscriptionModel(nextSettings.transcriptionModel?.model || '');
        const existing: ModelServiceProvider | undefined =
          nextSettings.providers.find(
            (provider: ModelServiceProvider): boolean => provider.enabled,
          );
        if (existing) {
          setProviderId(existing.id);
          if (!nextSettings.transcriptionModel?.providerId) {
            setTranscriptionProviderId(existing.id);
          }
          setProviderName(existing.name);
          setBaseUrl(existing.baseUrl);
          setApiKey('');
          setProviderPresetId(
            PROVIDER_PRESETS.some(
              (preset: ProviderPreset): boolean =>
                preset.baseUrl === existing.baseUrl,
            )
              ? PROVIDER_PRESETS.find(
                  (preset: ProviderPreset): boolean =>
                    preset.baseUrl === existing.baseUrl,
                )?.id || 'custom'
              : 'custom',
          );
        }
        if (nextSettings.summaryModel?.model) {
          setModel(nextSettings.summaryModel.model);
        }
      })
      .catch((nextError: unknown): void => {
        if (mounted) setError(getErrorMessage(nextError));
      })
      .finally((): void => {
        if (mounted) setLoading(false);
      });
    return (): void => {
      mounted = false;
    };
  }, [searchParams, requestedCapability]);

  useEffect((): (() => void) | undefined => {
    if (step !== 'transcription') return undefined;
    let mounted = true;
    if (transcriptionMode === 'tencent_asr' && !tencentSettings) {
      getTencentAsrSettings()
        .then((next: TencentAsrSettings): void => {
          if (!mounted) return;
          setTencentSettings(next);
          setTencentForm((current) => ({
            ...current,
            asrRegion: next.asrRegion,
            bucket: next.bucket,
            engineModelType: next.engineModelType,
            region: next.region,
          }));
        })
        .catch((nextError: unknown): void => {
          if (mounted) setError(getErrorMessage(nextError));
        });
    }
    if (transcriptionMode === 'custom_api' && transcriptionProviderId) {
      setTranscriptionLoading(true);
      getModelProviderModels(transcriptionProviderId, 'transcription')
        .then((response): void => {
          if (!mounted) return;
          setTranscriptionModels(response.items);
          if (response.items[0]) {
            setTranscriptionModel((current) => current || response.items[0].id);
          }
        })
        .catch((nextError: unknown): void => {
          if (mounted) setError(getErrorMessage(nextError));
        })
        .finally((): void => {
          if (mounted) setTranscriptionLoading(false);
        });
    }
    return (): void => {
      mounted = false;
    };
  }, [step, transcriptionMode, transcriptionProviderId, tencentSettings]);

  useEffect((): void => {
    if (providerPresetId === 'custom') return;
    setProviderName(selectedPreset.name);
    setBaseUrl(selectedPreset.baseUrl);
  }, [providerPresetId, selectedPreset]);

  useEffect((): void => {
    if (step !== 'environment' || environment || working) return;
    void handleEnvironmentNext();
  }, [step, environment, working]);

  const saveProgress = async (nextStep: SetupStep): Promise<void> => {
    const nextStatus: SetupStatusResponse = await updateSetupProgress({
      currentStep: nextStep,
      selectedCapabilities: uniqueCapabilities(selectedCapabilities),
    });
    setStatus(nextStatus);
    setStep(nextStep);
  };

  const handleBack = async (): Promise<void> => {
    const previousStep: SetupStep | undefined = getPreviousSetupStep(
      step,
      selectedCapabilities,
    );
    if (!previousStep) return;
    setWorking(true);
    setError('');
    try {
      await saveProgress(previousStep);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  const handleProviderPresetChange = (nextPresetId: string): void => {
    const nextPreset: ProviderPreset | undefined = PROVIDER_PRESETS.find(
      (preset: ProviderPreset): boolean => preset.id === nextPresetId,
    );
    if (!nextPreset) return;
    const matchingProvider: ModelServiceProvider | undefined =
      nextPreset.id === 'custom'
        ? undefined
        : aiSettings?.providers.find(
            (provider: ModelServiceProvider): boolean =>
              provider.baseUrl === nextPreset.baseUrl,
          );
    setProviderPresetId(nextPresetId);
    setProviderId(matchingProvider?.id || '');
    setProviderName(
      matchingProvider?.name ||
        (nextPreset.id === 'custom' ? '' : nextPreset.name),
    );
    setBaseUrl(matchingProvider?.baseUrl || nextPreset.baseUrl);
    setApiKey('');
    setModels(matchingProvider?.models || []);
    setModel(
      matchingProvider && aiSettings?.summaryModel?.providerId === matchingProvider.id
        ? aiSettings.summaryModel.model
        : '',
    );
    setUrlNotice('');
    setError('');
  };

  const handleWelcomeNext = async (): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      await saveProgress('environment');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  const handleUseDocumentsOnly = async (): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      const documentsOnly: SetupCapability[] = ['documents'];
      setSelectedCapabilities(documentsOnly);
      const nextStatus: SetupStatusResponse = await updateSetupProgress({
        currentStep: 'provider',
        selectedCapabilities: documentsOnly,
      });
      setStatus(nextStatus);
      setEnvironment(null);
      setStep('provider');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  const handleEnvironmentNext = async (): Promise<void> => {
    if (environmentValidationInFlight.current) return;
    environmentValidationInFlight.current = true;
    setWorking(true);
    setError('');
    try {
      const result: SetupEnvironmentResponse = await validateSetupEnvironment();
      setEnvironment(result);
      const blocking: boolean = result.checks.some(
        (check): boolean => check.required && check.status === 'unavailable',
      );
      if (blocking) {
        const missingLabels: string = result.checks
          .filter((check): boolean => check.required && check.status === 'unavailable')
          .map((check): string => check.label)
          .join('、');
        setError(
          result.storageReady
            ? `暂时缺少：${missingLabels}。可以先使用文档笔记，稍后再补齐。`
            : `暂时缺少：${missingLabels}。本机数据目录不可用，请先修复磁盘空间或文件权限。`,
        );
        return;
      }
      await saveProgress('provider');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
      environmentValidationInFlight.current = false;
    }
  };

  const handleSkipTo = async (nextStep: SetupStep): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      await saveProgress(nextStep);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  const handleProviderNext = async (): Promise<void> => {
    setWorking(true);
    setError('');
    setUrlNotice('');
    try {
      const analysis = await analyzeSetupProviderUrl({ baseUrl });
      if (!analysis.valid) {
        setError(analysis.message || 'API 地址无效。');
        return;
      }
      if (analysis.requiresConfirmation && analysis.normalizedUrl) {
        setBaseUrl(analysis.normalizedUrl);
        setUrlNotice(`${analysis.message || '建议使用规范化地址。'} 已填入建议地址，请再次点击继续。`);
        return;
      }
      const provider: ModelServiceProvider = providerId
        ? await updateModelServiceProvider(providerId, {
            apiKey: apiKey || undefined,
            baseUrl,
            enabled: true,
            name: providerName,
          })
        : await createModelServiceProvider({
            apiKey: apiKey || undefined,
            baseUrl,
            enabled: true,
            name: providerName,
          });
      setProviderId(provider.id);
      if (!transcriptionProviderId) setTranscriptionProviderId(provider.id);
      const nextModels: ModelProviderModel[] = (
        await getModelProviderModels(provider.id, 'llm')
      ).items;
      setModels(nextModels);
      const nextModel: string =
        model || nextModels[0]?.id || '';
      setModel(nextModel);
      if (!nextModel) {
        setError('服务已连接，但没有自动发现模型。请在下一步手动填写模型名称。');
      }
      setAiSettings(await getAiModelSettings());
      await saveProgress('capabilities');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  const handleCapabilitiesNext = async (): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      if (!providerId || !model.trim()) {
        setError('请先选择或填写一个总结模型。');
        return;
      }
      const currentSettings: AiModelSettings =
        aiSettings || (await getAiModelSettings());
      const nextSettings: AiModelSettings = await updateAiModelSettings({
        summaryModel: {
          model: model.trim(),
          providerId,
          providerName,
        },
        transcriptionMode: currentSettings.transcriptionMode,
        transcriptionModel: currentSettings.transcriptionModel,
      });
      setAiSettings(nextSettings);
      await validateSetupSummaryModel({
        model: model.trim(),
        providerId,
      });
      await saveProgress(
        hasMediaCapability(selectedCapabilities)
          ? 'transcription'
          : requiresExternalSync
            ? 'connector'
            : 'review',
      );
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  const handleTranscriptionNext = async (): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      if (transcriptionMode === 'custom_api') {
        if (!transcriptionProviderId || !transcriptionModel.trim()) {
          setError('请选择或填写一个转录模型。');
          return;
        }
        const currentSettings: AiModelSettings =
          aiSettings || (await getAiModelSettings());
        const provider: ModelServiceProvider | undefined = currentSettings.providers.find(
          (item: ModelServiceProvider): boolean =>
            item.id === transcriptionProviderId,
        );
        if (!provider) {
          setError('转录服务提供者不存在，请返回上一页重新选择。');
          return;
        }
        const nextSettings: AiModelSettings = await updateAiModelSettings({
          summaryModel: currentSettings.summaryModel,
          transcriptionMode: 'custom_api',
          transcriptionModel: {
            model: transcriptionModel.trim(),
            providerId: transcriptionProviderId,
            providerName: provider.name,
          },
        });
        setAiSettings(nextSettings);
        await validateSetupTranscriptionModel({
          model: transcriptionModel.trim(),
          providerId: transcriptionProviderId,
        });
      } else {
        const missingTencentFields: string[] = [
          !tencentForm.secretId.trim() && !tencentSettings?.secretId ? 'SecretId' : '',
          !tencentForm.secretKey.trim() && !tencentSettings?.secretKeyConfigured ? 'SecretKey' : '',
          !tencentForm.region.trim() ? '腾讯云地域' : '',
          !tencentForm.bucket.trim() ? 'COS 存储桶' : '',
        ].filter(Boolean);
        if (missingTencentFields.length > 0) {
          setError(`请补充：${missingTencentFields.join('、')}。`);
          return;
        }
        const saved: TencentAsrSettings = await updateTencentAsrSettings({
          ...tencentForm,
          enabled: true,
        });
        setTencentSettings(saved);
        await validateSetupTencentAsr();
      }
      await saveProgress(requiresExternalSync ? 'connector' : 'review');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  const handleConnectorNext = async (): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      await saveProgress('review');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  const handleComplete = async (): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      const nextStatus: SetupStatusResponse = await completeSetup();
      setStatus(nextStatus);
      setCompleted(true);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  const handleReset = async (): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      const nextStatus: SetupStatusResponse = await resetSetupProgress();
      setStatus(nextStatus);
      setSelectedCapabilities(
        requestedCapability ? ['documents', requestedCapability] : ['documents'],
      );
      setEnvironment(null);
      setStep('welcome');
      setCompleted(false);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div aria-live="polite" className="flex items-center gap-3 text-sm text-slate-600" role="status">
          <LoaderCircle className="size-5 animate-spin" />
          正在读取首次配置状态…
        </div>
      </main>
    );
  }

  const pendingActionLabels: string[] = (status?.requiredActions || [])
    .filter((action): boolean => action.action !== 'repair_storage')
    .map((action): string => action.label);
  const summaryConfigured: boolean = Boolean(aiSettings?.summaryModel || model.trim());
  const transcriptionConfigured: boolean = Boolean(
    aiSettings?.transcriptionModel ||
      (transcriptionMode === 'tencent_asr' && tencentSettings?.configured),
  );

  if (completed) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
        <section className="mx-auto max-w-2xl rounded-2xl border bg-white p-8 shadow-sm sm:p-10">
          <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="size-7" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            配置完成
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            工作台已经准备好了
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            你可以从文档开始，也可以稍后在参数配置中增加音频、视频和同步能力。
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button data-ai-section-type="button" onClick={(): void => navigate(returnTo)}>
              创建第一篇笔记
              <ArrowRight className="size-4" />
            </Button>
            <Button
              data-ai-section-type="button"
              onClick={(): void => navigate('/settings')}
              variant="outline"
            >
              打开参数配置
            </Button>
          </div>
        </section>
      </main>
    );
  }

  const stepIndex: number = Math.max(
    0,
    SETUP_STEPS.findIndex(({ id }: { id: SetupStep; label: string }): boolean => id === step),
  );
  const selectedCapabilityLabels: string[] = selectedCapabilities.map(
    (capability: SetupCapability): string =>
      CAPABILITIES.find((item): boolean => item.id === capability)?.label || capability,
  );
  const missingEnvironmentLabels: string[] = environment?.checks
    .filter((check): boolean => check.required && check.status === 'unavailable')
    .map((check): string => check.label) || [];
  const canUseDocumentsOnly: boolean = Boolean(
    environment && environment.storageReady && missingEnvironmentLabels.length > 0,
  );

  return (
    <main className="guided-page min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950 sm:px-6 sm:py-10">
      <div className="guided-page__container mx-auto w-full max-w-none">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/10">
              <Waypoints className="size-5" />
            </span>
            <div>
              <p className="font-semibold tracking-tight">多媒体笔记工作台</p>
              <p className="text-xs text-slate-500">首次启动 · 约 2 分钟</p>
            </div>
          </div>
          <Button
            aria-label="重新开始首次配置"
            data-ai-section-type="button"
            disabled={working}
            onClick={(): void => void handleReset()}
            size="icon"
            variant="ghost"
          >
            <RotateCcw className="size-4" />
          </Button>
        </header>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">把资料变成笔记</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">先把工作台准备好</h1>
          </div>
          <p className="max-w-sm text-left text-sm leading-6 text-slate-500 sm:text-right">
            只配置你现在要用的能力。系统会自动检查环境并记住你的选择。
          </p>
        </div>

        <nav aria-label="首次配置进度" className="mt-7 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-7">
          {SETUP_STEPS.map(
            ({ id, label }: { id: SetupStep; label: string }, index: number): React.ReactNode => (
              <div aria-current={index === stepIndex ? 'step' : undefined} className="min-w-0" key={id}>
                <div className={`h-1.5 rounded-full ${index <= stepIndex ? 'bg-blue-600' : 'bg-slate-200'}`} />
                <p className={`mt-2 truncate text-xs ${index === stepIndex ? 'font-semibold text-blue-700' : 'text-slate-500'}`}>{label}</p>
              </div>
            ),
          )}
        </nav>

        {error && (
          <Alert className="mt-6 border-amber-200 bg-amber-50 text-amber-950" variant="default">
            <AlertTriangle className="size-4" />
            <AlertTitle>还需要处理一项问题</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <p className="sr-only" aria-live="polite">当前为第 {stepIndex + 1} 步：{SETUP_STEPS[stepIndex]?.label}</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,35,60,0.08)] sm:p-9">
            {step === 'welcome' && (
              <div>
                <div className="flex items-start gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Sparkles className="size-6" /></div>
                  <div>
                    <p className="text-sm font-medium text-blue-700">第 1 步 · 选择用途</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight">你准备先整理什么？</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">只勾选现在需要的入口，之后随时可以在“参数配置”中增加。</p>
                  </div>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {visibleCapabilities.map(
                    ({ description, id, label }): React.ReactNode => {
                      const checked: boolean = selectedCapabilities.includes(id);
                      const Icon = id === 'documents' ? FileText : id === 'local_audio' || id === 'recording' ? Mic2 : id === 'local_video' ? Video : Link2;
                      return (
                        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${checked ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'}`} key={id}>
                          <Checkbox checked={checked} onCheckedChange={(value: boolean | 'indeterminate'): void => {
                            setSelectedCapabilities((current: SetupCapability[]): SetupCapability[] => value === true ? uniqueCapabilities([...current, id]) : current.filter((item: SetupCapability): boolean => item !== id));
                          }} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-blue-600" />{label}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                          </span>
                        </label>
                      );
                    },
                  )}
                </div>
                <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>笔记和原始资料默认保存在这台电脑上。需要自动同步到飞书或钉钉时，再勾选“外部同步”并完成授权。</span>
                </div>
                <div className="mt-8 flex justify-end">
                  <Button data-ai-section-type="button" disabled={working || selectedCapabilities.length === 0} onClick={(): void => void handleWelcomeNext()}>
                    开始准备
                    {working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  </Button>
                </div>
              </div>
            )}

            {step === 'environment' && (
              <div>
                <p className="text-sm font-medium text-blue-700">第 2 步 · 自动准备</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">正在检查你的工作台</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">不用安装开发工具。我们只检查你刚才选择的能力是否可以正常运行。</p>
                <div aria-live="polite" className="mt-8 grid gap-3" role="status">
                  {environment ? environment.checks.map((check): React.ReactNode => (
                    <div className={`flex items-start gap-3 rounded-xl border p-4 ${check.status === 'unavailable' ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-slate-50/40'}`} key={check.id}>
                      {check.status === 'ready' ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /> : check.status === 'not_required' ? <ShieldCheck className="mt-0.5 size-5 text-slate-400" /> : <AlertTriangle className="mt-0.5 size-5 text-amber-600" />}
                      <div><p className="text-sm font-medium">{check.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{check.detail}</p></div>
                    </div>
                  )) : <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-blue-800"><LoaderCircle className="size-5 animate-spin" />正在检测本机环境…</div>}
                </div>
                {missingEnvironmentLabels.length > 0 && (
                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
                    <p className="font-medium">还需要处理：{missingEnvironmentLabels.join('、')}</p>
                    {canUseDocumentsOnly ? (
                      <>
                        <p className="mt-1 text-xs leading-5 text-amber-900/75">这不会影响文档笔记。你可以先完成首次使用，之后补齐组件并在“参数配置”中重新开启对应能力。</p>
                        <Button className="mt-3" data-ai-section-type="button" disabled={working} onClick={(): void => void handleUseDocumentsOnly()} size="sm" variant="outline">先使用文档笔记</Button>
                      </>
                    ) : (
                      <p className="mt-1 text-xs leading-5 text-amber-900/75">本机数据目录当前不可用，请先修复磁盘空间或文件权限后再继续。</p>
                    )}
                  </div>
                )}
                <div className="mt-8 flex flex-wrap justify-between gap-3">
                  <Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleBack()} variant="ghost"><ArrowLeft className="size-4" />返回</Button>
                  <div className="flex flex-wrap justify-end gap-2">
                    {environment && missingEnvironmentLabels.length > 0 && environment.storageReady && <Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleSkipTo('provider')} variant="ghost">跳过组件，稍后配置</Button>}
                    {environment && <Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleEnvironmentNext()}>{missingEnvironmentLabels.length > 0 ? '重新检查' : '继续'}{working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</Button>}
                  </div>
                </div>
              </div>
            )}

            {step === 'provider' && (
              <div>
                <p className="text-sm font-medium text-blue-700">第 3 步 · 连接一次</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">连接你的 AI 服务</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">选择你已有的服务，然后粘贴 API Key。地址和服务名称会自动填好。</p>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {PROVIDER_PRESETS.filter((preset: ProviderPreset): boolean => preset.id !== 'custom').map((preset: ProviderPreset): React.ReactNode => {
                    const selected: boolean = providerPresetId === preset.id;
                    return <button aria-pressed={selected} className={`flex min-h-16 items-center justify-between rounded-xl border px-4 text-left transition ${selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'}`} key={preset.id} onClick={(): void => handleProviderPresetChange(preset.id)} type="button"><span><span className="block text-sm font-medium">{preset.name}</span><span className="mt-1 block text-xs text-slate-500">{preset.id === 'ollama' ? '本机运行 · 不需要 Key' : 'OpenAI 兼容接口'}</span></span>{selected && <CheckCircle2 className="size-5 text-blue-600" />}</button>;
                  })}
                  <button aria-pressed={providerPresetId === 'custom'} className={`flex min-h-16 items-center justify-between rounded-xl border px-4 text-left transition ${providerPresetId === 'custom' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'}`} onClick={(): void => handleProviderPresetChange('custom')} type="button"><span><span className="block text-sm font-medium">其他兼容服务</span><span className="mt-1 block text-xs text-slate-500">填写自己的服务地址</span></span>{providerPresetId === 'custom' && <CheckCircle2 className="size-5 text-blue-600" />}</button>
                </div>
                <div className="mt-6 grid gap-2"><Label htmlFor="setup-api-key">API Key{!selectedPreset.requiresApiKey ? '（可选）' : ''}</Label><Input id="setup-api-key" type="password" value={apiKey} onChange={(event): void => setApiKey(event.target.value)} placeholder={providerId ? '已保存；留空表示不修改' : '粘贴 API Key'} /><p className="text-xs leading-5 text-slate-500">密钥只保存在本机，不会显示在页面或日志中。</p></div>
                <details className="group mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-700">高级设置（通常不需要修改）<ChevronDown className="size-4 transition group-open:rotate-180" /></summary>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="setup-base-url">API 地址</Label><Input id="setup-base-url" value={baseUrl} onChange={(event): void => { setBaseUrl(event.target.value); setUrlNotice(''); }} placeholder="https://api.example.com/v1" />{urlNotice && <p className="text-xs text-amber-700">{urlNotice}</p>}</div>{providerPresetId === 'custom' && <div className="grid gap-2"><Label htmlFor="setup-provider-name">服务名称</Label><Input id="setup-provider-name" value={providerName} onChange={(event): void => setProviderName(event.target.value)} placeholder="例如：公司内部模型" /></div>}</div>
                </details>
                <div className="mt-8 flex justify-between gap-3"><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleBack()} variant="ghost"><ArrowLeft className="size-4" />返回</Button><div className="flex flex-wrap justify-end gap-2"><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleSkipTo(hasMediaCapability(selectedCapabilities) ? 'transcription' : requiresExternalSync ? 'connector' : 'review')} variant="ghost">跳过，稍后配置</Button><Button data-ai-section-type="button" disabled={working || (selectedPreset.requiresApiKey && !apiKey && !providerId)} onClick={(): void => void handleProviderNext()}>连接并继续{working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</Button></div></div>
              </div>
            )}

            {step === 'capabilities' && (
              <div>
                <p className="text-sm font-medium text-blue-700">第 4 步 · 选一个默认模型</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">确认总结模型</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">系统会用它把原文整理成结构化笔记。列表由刚刚连接的服务自动读取。</p>
                <div className="mt-7 grid gap-5"><div className="grid gap-2"><Label htmlFor="setup-model">总结模型</Label>{models.length > 0 ? <Select value={model} onValueChange={setModel}><SelectTrigger id="setup-model"><SelectValue placeholder="选择总结模型" /></SelectTrigger><SelectContent>{models.map((item: ModelProviderModel): React.ReactNode => <SelectItem key={item.id} value={item.id}>{item.name || item.id}</SelectItem>)}</SelectContent></Select> : <Input id="setup-model" value={model} onChange={(event): void => setModel(event.target.value)} placeholder="例如：deepseek-chat" />}<p className="text-xs text-slate-500">没有自动列表时，填写服务商提供的模型 ID 即可。</p></div><div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-sm font-medium text-blue-950">本次会启用</p><div className="mt-2 flex flex-wrap gap-2">{selectedCapabilityLabels.map((label: string): React.ReactNode => <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600" key={label}>{label}</span>)}</div></div></div>
                <div className="mt-8 flex justify-between gap-3"><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleBack()} variant="ghost"><ArrowLeft className="size-4" />返回</Button><div className="flex flex-wrap justify-end gap-2"><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleSkipTo(hasMediaCapability(selectedCapabilities) ? 'transcription' : requiresExternalSync ? 'connector' : 'review')} variant="ghost">跳过，稍后配置</Button><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleCapabilitiesNext()}>验证并继续{working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</Button></div></div>
              </div>
            )}

            {step === 'transcription' && (
              <div>
                <p className="text-sm font-medium text-blue-700">第 5 步 · 仅音视频需要</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">选择语音转文字方式</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">你选择了音频或视频。文档笔记不会经过这一步。优先选择你已经有账号的服务。</p>
                <div className="mt-7 grid gap-3 sm:grid-cols-2"><button aria-pressed={transcriptionMode === 'custom_api'} className={`rounded-xl border p-4 text-left transition ${transcriptionMode === 'custom_api' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'}`} onClick={(): void => setTranscriptionMode('custom_api')} type="button"><span className="flex items-center gap-2 text-sm font-medium"><Mic2 className="size-4 text-blue-600" />沿用刚刚的 AI 服务</span><span className="mt-2 block text-xs leading-5 text-slate-500">如果服务支持语音模型，无需再填一套账号。</span></button><button aria-pressed={transcriptionMode === 'tencent_asr'} className={`rounded-xl border p-4 text-left transition ${transcriptionMode === 'tencent_asr' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'}`} onClick={(): void => setTranscriptionMode('tencent_asr')} type="button"><span className="flex items-center gap-2 text-sm font-medium"><Waypoints className="size-4 text-blue-600" />腾讯云 ASR</span><span className="mt-2 block text-xs leading-5 text-slate-500">识别效果稳定，需要腾讯云 SecretId、SecretKey 和 COS。</span></button></div>
                {transcriptionMode === 'custom_api' && <div className="mt-6 grid gap-4"><div className="grid gap-2"><Label htmlFor="setup-transcription-provider">转录服务提供者</Label><Select value={transcriptionProviderId} onValueChange={(value: string): void => { setTranscriptionProviderId(value); setTranscriptionModel(''); }}><SelectTrigger id="setup-transcription-provider"><SelectValue placeholder="选择已配置的提供者" /></SelectTrigger><SelectContent>{(aiSettings?.providers || []).filter((provider: ModelServiceProvider): boolean => provider.enabled && provider.configured).map((provider: ModelServiceProvider): React.ReactNode => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="setup-transcription-model">转录模型</Label>{transcriptionModels.length > 0 ? <Select value={transcriptionModel} onValueChange={setTranscriptionModel}><SelectTrigger id="setup-transcription-model"><SelectValue placeholder="选择转录模型" /></SelectTrigger><SelectContent>{transcriptionModels.map((item: ModelProviderModel): React.ReactNode => <SelectItem key={item.id} value={item.id}>{item.name || item.id}</SelectItem>)}</SelectContent></Select> : <Input id="setup-transcription-model" value={transcriptionModel} onChange={(event): void => setTranscriptionModel(event.target.value)} placeholder={transcriptionLoading ? '正在读取模型列表…' : '例如：whisper-1'} />}<p className="text-xs leading-5 text-slate-500">没有模型列表时可以直接填写模型 ID。</p></div></div>}
                {transcriptionMode === 'tencent_asr' && <div className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="setup-tencent-secret-id">SecretId</Label><Input id="setup-tencent-secret-id" value={tencentForm.secretId} onChange={(event): void => setTencentForm((current) => ({ ...current, secretId: event.target.value }))} placeholder={tencentSettings?.secretId || 'AKID…'} /></div><div className="grid gap-2"><Label htmlFor="setup-tencent-secret-key">SecretKey</Label><Input id="setup-tencent-secret-key" type="password" value={tencentForm.secretKey} onChange={(event): void => setTencentForm((current) => ({ ...current, secretKey: event.target.value }))} placeholder={tencentSettings?.secretKeyConfigured ? '已保存；留空表示不修改' : '请输入 SecretKey'} /></div><div className="grid gap-2"><Label htmlFor="setup-tencent-region">腾讯云地域</Label><Input id="setup-tencent-region" value={tencentForm.region} onChange={(event): void => setTencentForm((current) => ({ ...current, region: event.target.value }))} placeholder="ap-shanghai" /></div><div className="grid gap-2"><Label htmlFor="setup-tencent-bucket">COS 存储桶</Label><Input id="setup-tencent-bucket" value={tencentForm.bucket} onChange={(event): void => setTencentForm((current) => ({ ...current, bucket: event.target.value }))} placeholder="bucket-name" /></div><p className="text-xs leading-5 text-amber-700 sm:col-span-2">腾讯云识别和 COS 可能产生费用，验证时会访问你的腾讯云账户。</p></div>}
                <div className="mt-8 flex justify-between gap-3"><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleBack()} variant="ghost"><ArrowLeft className="size-4" />返回</Button><div className="flex flex-wrap justify-end gap-2"><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleSkipTo(requiresExternalSync ? 'connector' : 'review')} variant="ghost">跳过，稍后配置</Button><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleTranscriptionNext()}>验证转录并继续{working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</Button></div></div>
              </div>
            )}

            {step === 'connector' && (
              <SetupConnectorStep
                onBack={(): void => void handleBack()}
                onContinue={handleConnectorNext}
                onSkip={(): Promise<void> => handleSkipTo('review')}
                working={working}
              />
            )}

            {step === 'review' && (
              <div>
                <p className="text-sm font-medium text-blue-700">第 7 步 · 自动验证</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">可以开始了</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">关键配置已经验证。点击完成后，直接进入第一篇笔记。</p>
                <div className="mt-7 grid gap-3">
                  <div className={`flex items-center gap-3 rounded-xl border p-4 ${summaryConfigured ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70'}`}>
                    {summaryConfigured ? <Check className="size-5 text-emerald-600" /> : <AlertTriangle className="size-5 text-amber-600" />}
                    <span className="text-sm text-slate-900">{summaryConfigured ? `总结模型已配置 · ${model || aiSettings?.summaryModel?.model || '已配置'}` : '总结模型尚未配置，可稍后在参数配置中补齐'}</span>
                  </div>
                  {requiresExternalSync ? <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4"><AlertTriangle className="size-5 text-amber-600" /><span className="text-sm text-slate-900">外部同步尚未确认，稍后可在参数配置中授权飞书或钉钉</span></div> : <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4"><FileText className="size-5 text-blue-600" /><span className="text-sm text-blue-950">未配置外部同步，笔记将保存为本地 Markdown 文件</span></div>}
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"><Check className="size-5 text-emerald-600" /><span className="text-sm text-emerald-950">本机数据保存已检查</span></div>
                  {hasMediaCapability(selectedCapabilities) && <div className={`flex items-center gap-3 rounded-xl border p-4 ${transcriptionConfigured ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70'}`}>{transcriptionConfigured ? <Check className="size-5 text-emerald-600" /> : <AlertTriangle className="size-5 text-amber-600" />}<span className="text-sm text-slate-900">{transcriptionConfigured ? '音视频转录已配置' : '音视频转录尚未配置，可在需要处理音视频时再补齐'}</span></div>}
                  {pendingActionLabels.length > 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">待配置项：{pendingActionLabels.join('、')}。完成引导后仍可进入工作台，使用对应功能时系统会再次提示。</div>}
                </div>
                <div className="mt-8 flex justify-between gap-3"><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleBack()} variant="ghost"><ArrowLeft className="size-4" />返回</Button><Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleComplete()}>完成并进入工作台{working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</Button></div>
              </div>
            )}
          </section>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_18px_48px_rgba(15,35,60,0.12)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300">你只需要准备</p>
            <div className="mt-5 grid gap-5"><div className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-sm">1</span><div><p className="text-sm font-medium">选择用途</p><p className="mt-1 text-xs leading-5 text-slate-300">只出现与你有关的检查项。</p></div></div><div className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-sm">2</span><div><p className="text-sm font-medium">准备一个模型 Key</p><p className="mt-1 text-xs leading-5 text-slate-300">服务地址、模型列表会自动读取。</p></div></div><div className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-sm">3</span><div><p className="text-sm font-medium">上传第一份资料</p><p className="mt-1 text-xs leading-5 text-slate-300">完成后直接进入工作台开始使用。</p></div></div></div>
            <div className="mt-7 border-t border-white/10 pt-4 text-xs leading-5 text-slate-300">配置随时可以在“参数配置”中修改，已经生成的笔记不会受到影响。</div>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default SetupPage;
