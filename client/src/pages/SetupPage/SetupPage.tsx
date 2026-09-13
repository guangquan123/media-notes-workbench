import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
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
import { isLocalRuntime } from '@/lib/runtime';

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

function getErrorMessage(error: unknown): string {
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

  const selectedPreset: ProviderPreset = useMemo(
    (): ProviderPreset =>
      PROVIDER_PRESETS.find(
        (preset: ProviderPreset): boolean => preset.id === providerPresetId,
      ) || PROVIDER_PRESETS[0],
    [providerPresetId],
  );
  const visibleCapabilities = useMemo(
    () =>
      isLocalRuntime()
        ? CAPABILITIES.filter(
            ({ id }: { id: SetupCapability }): boolean => id !== 'external_sync',
          )
        : CAPABILITIES,
    [],
  );

  useEffect((): (() => void) => {
    let mounted = true;
    Promise.all([getSetupStatus(), getAiModelSettings()])
      .then(([nextStatus, nextSettings]: [SetupStatusResponse, AiModelSettings]): void => {
        if (!mounted) return;
        setStatus(nextStatus);
        setStep(getInitialStep(nextStatus, requestedCapability));
        const requested: SetupCapability | undefined = requestedCapability;
        if (nextStatus.selectedCapabilities.length > 0 || requested) {
          const requestedCapabilities: SetupCapability[] = requested
            ? ['documents', requested]
            : [];
          setSelectedCapabilities(
            uniqueCapabilities([
              ...nextStatus.selectedCapabilities,
              ...requestedCapabilities,
            ]),
          );
        }
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
          if (!transcriptionModel && response.items[0]) {
            setTranscriptionModel(response.items[0].id);
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
  }, [step, transcriptionMode, transcriptionProviderId, tencentSettings, transcriptionModel]);

  useEffect((): void => {
    if (providerPresetId === 'custom') return;
    setProviderName(selectedPreset.name);
    setBaseUrl(selectedPreset.baseUrl);
  }, [providerPresetId, selectedPreset]);

  const saveProgress = async (nextStep: SetupStep): Promise<void> => {
    const nextStatus: SetupStatusResponse = await updateSetupProgress({
      currentStep: nextStep,
      selectedCapabilities: uniqueCapabilities(selectedCapabilities),
    });
    setStatus(nextStatus);
    setStep(nextStep);
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

  const handleEnvironmentNext = async (): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      const result: SetupEnvironmentResponse = await validateSetupEnvironment();
      setEnvironment(result);
      const blocking: boolean = result.checks.some(
        (check): boolean => check.required && check.status === 'unavailable',
      );
      if (blocking) {
        setError('当前选择的能力仍缺少必要的本机组件，请先处理检查结果。');
        return;
      }
      await saveProgress('provider');
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
      await saveProgress(hasMediaCapability(selectedCapabilities) ? 'transcription' : 'review');
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
        const saved: TencentAsrSettings = await updateTencentAsrSettings({
          ...tencentForm,
          enabled: true,
        });
        setTencentSettings(saved);
        await validateSetupTencentAsr();
      }
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
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <LoaderCircle className="size-5 animate-spin" />
          正在读取首次配置状态…
        </div>
      </main>
    );
  }

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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Waypoints className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-slate-950">多媒体笔记工作台</p>
              <p className="text-xs text-slate-500">首次配置</p>
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

        <nav aria-label="首次配置进度" className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-6">
          {SETUP_STEPS.map(
            ({ id, label }: { id: SetupStep; label: string }, index: number): React.ReactNode => (
              <div className="min-w-0" key={id}>
                <div
                  className={`h-1 rounded-full ${index <= stepIndex ? 'bg-slate-900' : 'bg-slate-200'}`}
                />
                <p className="mt-2 truncate text-xs text-slate-500">{label}</p>
              </div>
            ),
          )}
        </nav>

        {error && (
          <Alert className="mt-6" variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>还需要处理一项问题</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
          {step === 'welcome' && (
            <div>
              <p className="text-sm font-medium text-slate-500">大约需要 2 分钟</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                先告诉我，你准备整理什么？
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                只会配置你现在需要的能力。笔记和原始资料默认保存在这台电脑上，之后可以随时增加其他能力。
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {visibleCapabilities.map(
                  ({ description, id, label }): React.ReactNode => {
                    const checked: boolean = selectedCapabilities.includes(id);
                    return (
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${checked ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
                        key={id}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value: boolean | 'indeterminate'): void => {
                            setSelectedCapabilities((current: SetupCapability[]): SetupCapability[] =>
                              value === true
                                ? uniqueCapabilities([...current, id])
                                : current.filter(
                                    (item: SetupCapability): boolean => item !== id,
                                  ),
                            );
                          }}
                        />
                        <span>
                          <span className="block text-sm font-medium text-slate-950">{label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                        </span>
                      </label>
                    );
                  },
                )}
              </div>
              {isLocalRuntime() && (
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  本地模式默认保存 Markdown 到此电脑。飞书或钉钉同步可在连接器设置中单独开启，不会影响首次使用。
                </p>
              )}
              <div className="mt-8 flex justify-end">
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleWelcomeNext()}>
                  开始配置
                  {working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                </Button>
              </div>
            </div>
          )}

          {step === 'environment' && (
            <div>
              <p className="text-sm font-medium text-slate-500">自动检查</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">正在准备本地工作台</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">系统会检查保存位置和你刚才选择的处理能力，不需要安装开发工具。</p>
              {environment && (
                <div className="mt-8 grid gap-3">
                  {environment.checks.map((check): React.ReactNode => (
                    <div className="flex items-start gap-3 rounded-xl border p-4" key={check.id}>
                      {check.status === 'ready' ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /> : check.status === 'not_required' ? <ShieldCheck className="mt-0.5 size-5 text-slate-400" /> : <AlertTriangle className="mt-0.5 size-5 text-amber-600" />}
                      <div>
                        <p className="text-sm font-medium text-slate-950">{check.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-8 flex justify-between gap-3">
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => setStep('welcome')} variant="ghost">
                  <ArrowLeft className="size-4" />返回
                </Button>
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleEnvironmentNext()}>
                  检查并继续
                  {working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                </Button>
              </div>
            </div>
          )}

          {step === 'provider' && (
            <div>
              <p className="text-sm font-medium text-slate-500">只需连接一次</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">连接你的 AI 服务</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">普通服务只需要粘贴 API Key。系统会自动保存、读取模型并验证一次真实调用。</p>
              <div className="mt-8 grid gap-5">
                <div className="grid gap-2">
                  <Label htmlFor="setup-provider">服务提供者</Label>
                  <Select value={providerPresetId} onValueChange={setProviderPresetId}>
                    <SelectTrigger id="setup-provider"><SelectValue placeholder="选择服务提供者" /></SelectTrigger>
                    <SelectContent>
                      {PROVIDER_PRESETS.map((preset: ProviderPreset): React.ReactNode => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {providerPresetId === 'custom' && (
                  <div className="grid gap-2">
                    <Label htmlFor="setup-provider-name">服务名称</Label>
                    <Input id="setup-provider-name" value={providerName} onChange={(event): void => setProviderName(event.target.value)} placeholder="例如：公司内部模型" />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="setup-base-url">API 地址</Label>
                  <Input id="setup-base-url" value={baseUrl} onChange={(event): void => { setBaseUrl(event.target.value); setUrlNotice(''); }} placeholder="https://api.example.com/v1" />
                  {urlNotice && <p className="text-xs text-amber-700">{urlNotice}</p>}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="setup-api-key">API Key{!selectedPreset.requiresApiKey ? '（可选）' : ''}</Label>
                  <Input id="setup-api-key" type="password" value={apiKey} onChange={(event): void => setApiKey(event.target.value)} placeholder={providerId ? '已保存；留空表示不修改' : '粘贴 API Key'} />
                  <p className="text-xs leading-5 text-slate-500">密钥只由本机服务保存，页面和日志不会显示完整内容。</p>
                </div>
              </div>
              <div className="mt-8 flex justify-between gap-3">
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => setStep('environment')} variant="ghost"><ArrowLeft className="size-4" />返回</Button>
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleProviderNext()}>
                  连接并继续
                  {working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                </Button>
              </div>
            </div>
          )}

          {step === 'capabilities' && (
            <div>
              <p className="text-sm font-medium text-slate-500">最后确认</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">选择总结模型</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">推荐模型已经自动填入。没有自动列表时，也可以手动填写服务商提供的模型名称。</p>
              <div className="mt-8 grid gap-5">
                <div className="grid gap-2">
                  <Label htmlFor="setup-model">总结模型</Label>
                  {models.length > 0 ? (
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger id="setup-model"><SelectValue placeholder="选择总结模型" /></SelectTrigger>
                      <SelectContent>{models.map((item: ModelProviderModel): React.ReactNode => <SelectItem key={item.id} value={item.id}>{item.name || item.id}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input id="setup-model" value={model} onChange={(event): void => setModel(event.target.value)} placeholder="例如：deepseek-chat" />
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-950">已选择的用途</p>
                  <div className="mt-3 flex flex-wrap gap-2">{selectedCapabilities.map((capability: SetupCapability): React.ReactNode => <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600" key={capability}>{CAPABILITIES.find((item): boolean => item.id === capability)?.label || capability}</span>)}</div>
                </div>
              </div>
              <div className="mt-8 flex justify-between gap-3">
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => setStep('provider')} variant="ghost"><ArrowLeft className="size-4" />返回</Button>
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleCapabilitiesNext()}>
                  验证模型并继续
                  {working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                </Button>
              </div>
            </div>
          )}

          {step === 'transcription' && (
            <div>
              <p className="text-sm font-medium text-slate-500">音视频能力</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                选择语音转文字方式
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                这一步只在你选择音频、视频或录音时出现。文档笔记不会依赖转录服务。
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <button
                  aria-pressed={transcriptionMode === 'custom_api'}
                  className={`rounded-xl border p-4 text-left transition ${transcriptionMode === 'custom_api' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
                  onClick={(): void => setTranscriptionMode('custom_api')}
                  type="button"
                >
                  <p className="text-sm font-medium text-slate-950">我的 API 模型</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    使用上一步的模型服务提供者或其他已配置提供者。
                  </p>
                </button>
                <button
                  aria-pressed={transcriptionMode === 'tencent_asr'}
                  className={`rounded-xl border p-4 text-left transition ${transcriptionMode === 'tencent_asr' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
                  onClick={(): void => setTranscriptionMode('tencent_asr')}
                  type="button"
                >
                  <p className="text-sm font-medium text-slate-950">腾讯云 ASR</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    需要腾讯云 SecretId、SecretKey 和 COS 存储桶。
                  </p>
                </button>
              </div>

              {transcriptionMode === 'custom_api' && (
                <div className="mt-6 grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="setup-transcription-provider">转录服务提供者</Label>
                    <Select
                      value={transcriptionProviderId}
                      onValueChange={(value: string): void => {
                        setTranscriptionProviderId(value);
                        setTranscriptionModel('');
                      }}
                    >
                      <SelectTrigger id="setup-transcription-provider">
                        <SelectValue placeholder="选择已配置的提供者" />
                      </SelectTrigger>
                      <SelectContent>
                        {(aiSettings?.providers || [])
                          .filter(
                            (provider: ModelServiceProvider): boolean =>
                              provider.enabled && provider.configured,
                          )
                          .map((provider: ModelServiceProvider): React.ReactNode => (
                            <SelectItem key={provider.id} value={provider.id}>
                              {provider.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="setup-transcription-model">转录模型</Label>
                    {transcriptionModels.length > 0 ? (
                      <Select value={transcriptionModel} onValueChange={setTranscriptionModel}>
                        <SelectTrigger id="setup-transcription-model">
                          <SelectValue placeholder="选择转录模型" />
                        </SelectTrigger>
                        <SelectContent>
                          {transcriptionModels.map((item: ModelProviderModel): React.ReactNode => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name || item.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="setup-transcription-model"
                        value={transcriptionModel}
                        onChange={(event): void => setTranscriptionModel(event.target.value)}
                        placeholder={transcriptionLoading ? '正在读取模型列表…' : '例如：whisper-1'}
                      />
                    )}
                    <p className="text-xs leading-5 text-slate-500">
                      没有模型列表时可以直接填写服务商提供的模型 ID。
                    </p>
                  </div>
                </div>
              )}

              {transcriptionMode === 'tencent_asr' && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="setup-tencent-secret-id">SecretId</Label>
                    <Input
                      id="setup-tencent-secret-id"
                      value={tencentForm.secretId}
                      onChange={(event): void =>
                        setTencentForm((current) => ({ ...current, secretId: event.target.value }))
                      }
                      placeholder={tencentSettings?.secretId || 'AKID…'}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="setup-tencent-secret-key">SecretKey</Label>
                    <Input
                      id="setup-tencent-secret-key"
                      type="password"
                      value={tencentForm.secretKey}
                      onChange={(event): void =>
                        setTencentForm((current) => ({ ...current, secretKey: event.target.value }))
                      }
                      placeholder={tencentSettings?.secretKeyConfigured ? '已保存；留空则不修改' : '请输入 SecretKey'}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="setup-tencent-region">腾讯云地域</Label>
                    <Input
                      id="setup-tencent-region"
                      value={tencentForm.region}
                      onChange={(event): void =>
                        setTencentForm((current) => ({ ...current, region: event.target.value }))
                      }
                      placeholder="ap-shanghai"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="setup-tencent-bucket">COS 存储桶</Label>
                    <Input
                      id="setup-tencent-bucket"
                      value={tencentForm.bucket}
                      onChange={(event): void =>
                        setTencentForm((current) => ({ ...current, bucket: event.target.value }))
                      }
                      placeholder="bucket-name"
                    />
                  </div>
                  <p className="sm:col-span-2 text-xs leading-5 text-amber-700">
                    腾讯云识别和 COS 可能产生费用，验证时会访问你的腾讯云账户。
                  </p>
                </div>
              )}

              <div className="mt-8 flex justify-between gap-3">
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => setStep('capabilities')} variant="ghost">
                  <ArrowLeft className="size-4" />返回
                </Button>
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleTranscriptionNext()}>
                  验证转录并继续
                  {working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                </Button>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div>
              <p className="text-sm font-medium text-slate-500">真实最小调用</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">完成最后验证</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">系统会确认模型可以返回内容，本机可以保存数据。测试只发送一小段固定文本，可能产生极少量调用费用。</p>
              <div className="mt-8 grid gap-3">
                <div className="flex items-center gap-3 rounded-xl border p-4"><Check className="size-5 text-emerald-600" /><span className="text-sm text-slate-700">AI 服务已连接</span></div>
                <div className="flex items-center gap-3 rounded-xl border p-4"><Check className="size-5 text-emerald-600" /><span className="text-sm text-slate-700">总结模型已完成真实测试：{model}</span></div>
                <div className="flex items-center gap-3 rounded-xl border p-4"><Check className="size-5 text-emerald-600" /><span className="text-sm text-slate-700">本机数据保存已检查</span></div>
                {hasMediaCapability(selectedCapabilities) && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">音视频转录已完成验证，可以直接开始处理。</div>}
              </div>
              <div className="mt-8 flex justify-between gap-3">
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => setStep('capabilities')} variant="ghost"><ArrowLeft className="size-4" />返回</Button>
                <Button data-ai-section-type="button" disabled={working} onClick={(): void => void handleComplete()}>
                  完成并进入工作台
                  {working ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                </Button>
              </div>
            </div>
          )}
        </section>
        <p className="mt-5 text-center text-xs text-slate-400">配置可以随时在“参数配置”中修改，已保存的笔记不会受到影响。</p>
      </div>
    </main>
  );
};

export default SetupPage;
