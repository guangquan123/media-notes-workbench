import {
  Boxes,
  CheckCircle2,
  Cloud,
  LoaderCircle,
  Mic2,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  Power,
  RefreshCw,
  Save,
  Server,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type {
  AiModelCapability,
  AiModelSettings,
  CreateModelServiceProviderRequest,
  ModelProviderModel,
  ModelProviderConnectionStatus,
  ModelReference,
  ModelServiceProvider,
  TranscriptionMode,
  UpdateModelServiceProviderRequest,
} from '@shared/api.interface';
import {
  createModelServiceProvider,
  deleteModelServiceProvider,
  getAiModelSettings,
  getModelProviderModels,
  testModelServiceProvider,
  updateAiModelSettings,
  updateModelServiceProvider,
} from '@/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import TranscriptionSettingsPage from '@/pages/TranscriptionSettingsPage/TranscriptionSettingsPage';

type AiSettingsTab = 'providers' | 'models' | 'transcription';

interface AiModelSettingsPageProps {
  embedded?: boolean;
  initialTab?: AiSettingsTab;
}

interface ProviderFormState {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  name: string;
}

interface ProviderTestState {
  checkedAt?: string;
  message: string;
  status: 'success' | 'error';
}

const EMPTY_PROVIDER_FORM: ProviderFormState = {
  apiKey: '',
  baseUrl: '',
  enabled: true,
  name: '',
};

function getProvider(
  providers: ModelServiceProvider[],
  id: string,
): ModelServiceProvider | undefined {
  return providers.find((provider: ModelServiceProvider): boolean => provider.id === id);
}

function isSelectableProvider(provider: ModelServiceProvider | undefined): boolean {
  return Boolean(provider?.enabled && provider.configured);
}

function getModelsForCapability(
  provider: ModelServiceProvider | undefined,
  capability: AiModelCapability,
): ModelProviderModel[] {
  return provider?.models.filter(
    (model: ModelProviderModel): boolean => model.capabilities.includes(capability),
  ) || [];
}

function modelReference(
  providers: ModelServiceProvider[],
  providerId: string,
  model: string,
): ModelReference | undefined {
  const provider: ModelServiceProvider | undefined = getProvider(providers, providerId);
  if (!provider || !model) return undefined;
  return { model, providerId, providerName: provider.name };
}

function getInitialTab(value: string | null, fallback: AiSettingsTab): AiSettingsTab {
  if (value === 'providers' || value === 'models') return value;
  if (value === 'transcription') return 'models';
  return fallback === 'transcription' ? 'models' : fallback;
}

export default function AiModelSettingsPage({
  embedded = false,
  initialTab = 'providers',
}: AiModelSettingsPageProps) {
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState<AiModelSettings | null>(null);
  const [tab, setTab] = useState<AiSettingsTab>(
    getInitialTab(searchParams.get('tab'), initialTab),
  );
  const [saving, setSaving] = useState(false);
  const [refreshingProviderId, setRefreshingProviderId] = useState<string | null>(null);
  const [loadingCapability, setLoadingCapability] = useState<AiModelCapability | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [updatingProviderId, setUpdatingProviderId] = useState<string | null>(null);
  const [providerTestStates, setProviderTestStates] = useState<Record<string, ProviderTestState>>({});
  const [asrProviderId, setAsrProviderId] = useState('');
  const [asrModel, setAsrModel] = useState('');
  const [llmProviderId, setLlmProviderId] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('tencent_asr');
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(EMPTY_PROVIDER_FORM);
  const [deletingProvider, setDeletingProvider] = useState<ModelServiceProvider | null>(null);

  useEffect((): void => {
    void getAiModelSettings()
      .then((next: AiModelSettings): void => setSettings(next))
      .catch((): void => {
        toast.error('无法读取模型服务配置');
      });
  }, []);

  useEffect((): void => {
    if (!settings) return;
    const firstProvider: ModelServiceProvider | undefined = settings.providers.find(
      (provider: ModelServiceProvider): boolean => provider.enabled && provider.configured,
    );
    const persistedAsrProvider: ModelServiceProvider | undefined = getProvider(
      settings.providers,
      settings.transcriptionModel?.providerId || '',
    );
    const persistedLlmProvider: ModelServiceProvider | undefined = getProvider(
      settings.providers,
      settings.summaryModel?.providerId || '',
    );
    const nextAsrProviderId: string = isSelectableProvider(persistedAsrProvider)
      ? persistedAsrProvider?.id || ''
      : firstProvider?.id || '';
    const nextLlmProviderId: string = isSelectableProvider(persistedLlmProvider)
      ? persistedLlmProvider?.id || ''
      : firstProvider?.id || '';
    const currentAsrProvider: ModelServiceProvider | undefined = getProvider(
      settings.providers,
      asrProviderId,
    );
    const currentLlmProvider: ModelServiceProvider | undefined = getProvider(
      settings.providers,
      llmProviderId,
    );
    const currentAsrProviderId: string = isSelectableProvider(currentAsrProvider)
      ? currentAsrProvider?.id || ''
      : nextAsrProviderId;
    const currentLlmProviderId: string = isSelectableProvider(currentLlmProvider)
      ? currentLlmProvider?.id || ''
      : nextLlmProviderId;
    const availableAsrModels: ModelProviderModel[] = getModelsForCapability(
      getProvider(settings.providers, currentAsrProviderId),
      'transcription',
    );
    const availableLlmModels: ModelProviderModel[] = getModelsForCapability(
      getProvider(settings.providers, currentLlmProviderId),
      'llm',
    );
    setAsrProviderId(currentAsrProviderId);
    setLlmProviderId(currentLlmProviderId);
    setAsrModel(
      availableAsrModels.some((model: ModelProviderModel): boolean => model.id === asrModel)
        ? asrModel
        : settings.transcriptionModel?.providerId === currentAsrProviderId
          ? settings.transcriptionModel.model
          : availableAsrModels[0]?.id || '',
    );
    setLlmModel(
      availableLlmModels.some((model: ModelProviderModel): boolean => model.id === llmModel)
        ? llmModel
        : settings.summaryModel?.providerId === currentLlmProviderId
          ? settings.summaryModel.model
          : availableLlmModels[0]?.id || '',
    );
    setTranscriptionMode(settings.transcriptionMode);
  }, [asrModel, asrProviderId, llmModel, llmProviderId, settings]);

  const asrModels: ModelProviderModel[] = useMemo(
    (): ModelProviderModel[] => getModelsForCapability(getProvider(settings?.providers || [], asrProviderId), 'transcription'),
    [asrProviderId, settings?.providers],
  );
  const llmModels: ModelProviderModel[] = useMemo(
    (): ModelProviderModel[] => getModelsForCapability(getProvider(settings?.providers || [], llmProviderId), 'llm'),
    [llmProviderId, settings?.providers],
  );

  const openCreateProvider = (): void => {
    setEditingProviderId(null);
    setProviderForm(EMPTY_PROVIDER_FORM);
    setProviderDialogOpen(true);
  };

  const openEditProvider = (provider: ModelServiceProvider): void => {
    setEditingProviderId(provider.id);
    setProviderForm({ apiKey: '', baseUrl: provider.baseUrl, enabled: provider.enabled, name: provider.name });
    setProviderDialogOpen(true);
  };

  const testProvider = async (provider: ModelServiceProvider): Promise<void> => {
    setTestingProviderId(provider.id);
    try {
      const result: ModelProviderConnectionStatus = await testModelServiceProvider(provider.id);
      setProviderTestStates((current: Record<string, ProviderTestState>): Record<string, ProviderTestState> => ({
        ...current,
        [provider.id]: { checkedAt: result.checkedAt, message: result.message, status: 'success' },
      }));
      toast.success(`${provider.name} 连通性测试成功`);
    } catch (error) {
      const message: string = error instanceof Error ? error.message : '连通性测试失败';
      setProviderTestStates((current: Record<string, ProviderTestState>): Record<string, ProviderTestState> => ({
        ...current,
        [provider.id]: { message, status: 'error' },
      }));
      toast.error(`${provider.name} 连通性测试失败`);
    } finally {
      setTestingProviderId(null);
    }
  };

  const toggleProvider = async (
    provider: ModelServiceProvider,
    enabled: boolean,
  ): Promise<void> => {
    setUpdatingProviderId(provider.id);
    try {
      const next: ModelServiceProvider = await updateModelServiceProvider(provider.id, {
        apiKey: '',
        baseUrl: provider.baseUrl,
        enabled,
        name: provider.name,
      });
      setSettings((current: AiModelSettings | null): AiModelSettings | null => {
        if (!current) return current;
        return {
          ...current,
          providers: current.providers.map(
            (item: ModelServiceProvider): ModelServiceProvider =>
              item.id === next.id ? next : item,
          ),
        };
      });
      toast.success(`${provider.name} 已${enabled ? '开启' : '关闭'}`);
    } catch {
      toast.error('修改提供者状态失败');
    } finally {
      setUpdatingProviderId(null);
    }
  };

  const saveProvider = async (): Promise<void> => {
    const input: CreateModelServiceProviderRequest = providerForm;
    try {
      const next: ModelServiceProvider = editingProviderId
        ? await updateModelServiceProvider(editingProviderId, input as UpdateModelServiceProviderRequest)
        : await createModelServiceProvider(input);
      setSettings((current: AiModelSettings | null): AiModelSettings | null => {
        if (!current) return current;
        const providers: ModelServiceProvider[] = editingProviderId
          ? current.providers.map((provider: ModelServiceProvider): ModelServiceProvider => provider.id === next.id ? next : provider)
          : [...current.providers, next];
        return { ...current, providers };
      });
      setProviderDialogOpen(false);
      toast.success(editingProviderId ? '提供者已更新' : '提供者已添加');
    } catch {
      toast.error('保存提供者失败，请检查名称、地址和 API Key');
    }
  };

  const removeProvider = async (): Promise<void> => {
    if (!deletingProvider || !settings) return;
    try {
      await deleteModelServiceProvider(deletingProvider.id);
      setSettings({ ...settings, providers: settings.providers.filter((provider: ModelServiceProvider): boolean => provider.id !== deletingProvider.id) });
      setDeletingProvider(null);
      toast.success('提供者已删除');
    } catch {
      toast.error('提供者正在被模型配置引用，暂时不能删除');
    }
  };

  const refreshModels = async (providerId: string, capability: AiModelCapability): Promise<void> => {
    setRefreshingProviderId(providerId);
    setLoadingCapability(capability);
    try {
      const response = await getModelProviderModels(providerId, capability);
      setSettings((current: AiModelSettings | null): AiModelSettings | null => {
        if (!current) return current;
        const providers: ModelServiceProvider[] = current.providers.map((provider: ModelServiceProvider): ModelServiceProvider => {
          if (provider.id !== providerId) return provider;
          const otherModels: ModelProviderModel[] = provider.models.filter((model: ModelProviderModel): boolean => !model.capabilities.includes(capability));
          return { ...provider, models: [...otherModels, ...response.items] };
        });
        return { ...current, providers };
      });
      toast.success(`已刷新 ${response.items.length} 个${capability === 'llm' ? '总结' : '转录'}模型`);
    } catch {
      toast.error('模型列表刷新失败，请检查 Provider 的 /models 接口');
    } finally {
      setRefreshingProviderId(null);
      setLoadingCapability(null);
    }
  };

  const selectModelProvider = (
    providerId: string,
    capability: AiModelCapability,
  ): void => {
    if (capability === 'transcription') {
      setAsrProviderId(providerId);
      setAsrModel('');
    } else {
      setLlmProviderId(providerId);
      setLlmModel('');
    }
    void refreshModels(providerId, capability);
  };

  const saveModelSettings = async (): Promise<void> => {
    if (!settings) return;
    setSaving(true);
    try {
      const next: AiModelSettings = await updateAiModelSettings({
        summaryModel: modelReference(settings.providers, llmProviderId, llmModel),
        transcriptionMode,
        transcriptionModel: modelReference(settings.providers, asrProviderId, asrModel),
      });
      setSettings(next);
      toast.success('模型配置已保存');
    } catch {
      toast.error('保存模型配置失败，请先选择已启用的提供者和模型');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <main className={embedded ? 'p-3 text-sm text-black/50' : 'min-h-screen bg-[#f7f7f5] p-8 text-sm text-black/50'}><LoaderCircle className="mr-2 inline size-4 animate-spin" />正在读取模型服务配置…</main>;
  }

  const currentAsrLabel: string = transcriptionMode === 'tencent_asr'
    ? '腾讯 ASR 资源包'
    : settings.transcriptionModel
      ? `${settings.transcriptionModel.providerName} · ${settings.transcriptionModel.model}`
      : '尚未配置 API 转录模型';
  const currentLlmLabel: string = settings.summaryModel ? `${settings.summaryModel.providerName} · ${settings.summaryModel.model}` : '使用妙搭内置 AI';
  const providerReady: boolean = settings.providers.some(isSelectableProvider);
  const transcriptionReady: boolean = transcriptionMode === 'tencent_asr' || Boolean(settings.transcriptionModel);
  const modelsReady: boolean = Boolean(settings.summaryModel) && transcriptionReady;
  const steps: Array<{
    detail: string;
    id: AiSettingsTab;
    label: string;
    ready: boolean;
  }> = [
    { detail: providerReady ? '连接已配置' : '先添加 API 地址和密钥', id: 'providers', label: '模型服务提供者', ready: providerReady },
    { detail: modelsReady ? '转录方式与总结模型已选择' : '选择转录方式和具体模型', id: 'models', label: '模型配置', ready: modelsReady },
  ];

  return (
    <main className={embedded ? 'text-[#161616]' : 'min-h-screen bg-[#f7f7f5] px-5 py-7 text-[#161616] md:px-10 md:py-10'}>
      <div className={embedded ? '' : 'mx-auto max-w-4xl'}>
        {!embedded && (
          <header className="flex items-center justify-between border-b border-black/8 pb-5">
            <div>
              <p className="text-sm font-semibold">模型服务与转录</p>
              <p className="text-xs text-black/45">提供者、能力模型和转录方式统一配置</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/"><Mic2 className="size-4" />返回入口</Link>
            </Button>
          </header>
        )}
        <section className={`${embedded ? 'pt-0' : 'mt-6'} space-y-4`}>
          <div className="rounded-xl border border-black/8 bg-white p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
              {steps.map((step, index: number): React.ReactNode => (
                <button
                  aria-current={tab === step.id ? 'step' : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${tab === step.id ? 'border-[#3370ff] bg-[#eef3ff]' : step.ready ? 'border-emerald-200 bg-emerald-50/50' : 'border-black/8 bg-[#fbfbfa]'}`}
                  key={step.id}
                  onClick={(): void => setTab(step.id)}
                  type="button"
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${step.ready ? 'bg-emerald-600 text-white' : tab === step.id ? 'bg-[#3370ff] text-white' : 'bg-black/8 text-black/55'}`}>
                    {step.ready ? <CheckCircle2 className="size-4" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{step.label}</span>
                    <span className="block truncate text-xs text-black/45">{step.detail}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-black/45">建议按 1 → 2 完成配置；已完成步骤可以随时返回修改。</p>
          </div>

          {tab === 'providers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">模型服务提供者</h2>
                  <p className="mt-1 text-xs text-black/50">API 地址和密钥只维护一次，供转录与总结模型复用。</p>
                </div>
                <Button onClick={openCreateProvider}><Plus className="size-4" />新增提供者</Button>
              </div>
              <div className="grid gap-3">
                {settings.providers.map((provider: ModelServiceProvider): React.ReactNode => {
                  const testState: ProviderTestState | undefined = providerTestStates[provider.id];
                  const testing: boolean = testingProviderId === provider.id;
                  const updating: boolean = updatingProviderId === provider.id;
                  return (
                    <div className="rounded-xl border border-black/8 bg-white p-4" key={provider.id}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#eef3ff] text-[#3370ff]"><Cloud className="size-4" /></div>
                          <div className="min-w-0">
                            <p className="font-medium">{provider.name}</p>
                            <p className="mt-1 truncate text-xs text-black/50">{provider.baseUrl}</p>
                            <p className="mt-2 text-xs text-black/45">{provider.apiKeyConfigured ? 'API Key 已保存' : '未配置 API Key'} · {provider.enabled ? '已启用' : '已停用'}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2 rounded-lg border border-black/8 px-3 py-2">
                            <Switch aria-label={`${provider.name}启用状态`} checked={provider.enabled} disabled={updating} onCheckedChange={(enabled: boolean): void => void toggleProvider(provider, enabled)} />
                            <span className="text-xs font-medium">{provider.enabled ? '已开启' : '已关闭'}</span>
                          </div>
                          <Button disabled={!provider.configured || testing} onClick={(): void => void testProvider(provider)} size="sm" variant="outline">
                            {testing ? <LoaderCircle className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}测试连通性
                          </Button>
                          <Button onClick={(): void => openEditProvider(provider)} size="sm" variant="outline"><Pencil className="size-3.5" />编辑</Button>
                          <Button onClick={(): void => setDeletingProvider(provider)} size="sm" variant="outline"><Trash2 className="size-3.5" />删除</Button>
                        </div>
                      </div>
                      {testState && <p className={`mt-3 flex items-center gap-2 text-xs ${testState.status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}><Power className="size-3.5" />{testState.message}</p>}
                    </div>
                  );
                })}
              </div>
              {settings.providers.length === 0 && <Alert><Server className="size-4" /><AlertTitle>还没有模型服务提供者</AlertTitle><AlertDescription>先添加一个 API 地址和 API Key，再配置转录与总结模型。</AlertDescription></Alert>}
            </div>
          )}

          {tab === 'models' && (
            <div className="space-y-5">
              <div><h2 className="text-xl font-semibold">模型配置</h2><p className="mt-1 text-xs text-black/50">在这里一次性选择转录方式、转录模型和总结模型。</p></div>
              <div className="grid gap-3 rounded-xl border border-black/8 bg-white p-4">
                <div><p className="font-medium">转录方式</p><p className="mt-1 text-xs text-black/45">保存时会同时记住默认方式和对应模型。</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button aria-pressed={transcriptionMode === 'custom_api'} className={`rounded-xl border p-4 text-left transition ${transcriptionMode === 'custom_api' ? 'border-[#3370ff] bg-[#eef3ff]' : 'border-black/8 bg-white'}`} onClick={(): void => setTranscriptionMode('custom_api')} type="button"><p className="font-medium">我的 API 模型</p><p className="mt-1 text-xs leading-5 text-black/50">使用下方提供者和转录模型。</p></button>
                  <button aria-pressed={transcriptionMode === 'tencent_asr'} className={`rounded-xl border p-4 text-left transition ${transcriptionMode === 'tencent_asr' ? 'border-[#3370ff] bg-[#eef3ff]' : 'border-black/8 bg-white'}`} onClick={(): void => setTranscriptionMode('tencent_asr')} type="button"><p className="font-medium">腾讯 ASR</p><p className="mt-1 text-xs leading-5 text-black/50">使用已配置的腾讯云 ASR 资源包。</p></button>
                </div>
                {transcriptionMode === 'custom_api' && <div className="grid gap-4 border-t border-black/8 pt-4">
                  <div className="grid gap-2"><Label>模型服务提供者</Label><Select value={asrProviderId} onValueChange={(value: string): void => selectModelProvider(value, 'transcription')}><SelectTrigger><SelectValue placeholder="选择已启用的提供者" /></SelectTrigger><SelectContent>{settings.providers.filter(isSelectableProvider).map((provider: ModelServiceProvider): React.ReactNode => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label>转录模型</Label><div className="flex gap-2"><Select disabled={loadingCapability === 'transcription'} value={asrModel} onValueChange={setAsrModel}><SelectTrigger className="min-w-0 flex-1">{loadingCapability === 'transcription' ? <span className="flex items-center gap-2 text-black/45"><LoaderCircle className="size-4 animate-spin" />正在加载模型…</span> : <SelectValue placeholder="选择转录模型" />}</SelectTrigger><SelectContent>{asrModels.length ? asrModels.map((model: ModelProviderModel): React.ReactNode => <SelectItem key={model.id} value={model.id}>{model.name || model.id}</SelectItem>) : <SelectItem disabled value="__no_transcription_models__">暂无转录模型</SelectItem>}</SelectContent></Select><Button aria-label="刷新转录模型" disabled={!asrProviderId || refreshingProviderId === asrProviderId} onClick={(): void => void refreshModels(asrProviderId, 'transcription')} size="icon" variant="outline"><RefreshCw className={`size-4 ${loadingCapability === 'transcription' ? 'animate-spin' : ''}`} /></Button></div></div>
                </div>}
                {transcriptionMode === 'tencent_asr' && <TranscriptionSettingsPage embedded />}
              </div>
              <div className="grid gap-4 rounded-xl border border-black/8 bg-white p-5">
                <div><p className="font-medium">LLM 总结模型</p><p className="mt-1 text-xs text-black/45">用于摘要、行动项和结构化输出。</p></div>
                <div className="grid gap-4">
                  <div className="grid gap-2"><Label>模型服务提供者</Label><Select value={llmProviderId} onValueChange={(value: string): void => selectModelProvider(value, 'llm')}><SelectTrigger><SelectValue placeholder="上方选择提供者" /></SelectTrigger><SelectContent>{settings.providers.filter(isSelectableProvider).map((provider: ModelServiceProvider): React.ReactNode => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label>总结模型</Label><div className="flex gap-2"><Select disabled={loadingCapability === 'llm'} value={llmModel} onValueChange={setLlmModel}><SelectTrigger className="min-w-0 flex-1">{loadingCapability === 'llm' ? <span className="flex items-center gap-2 text-black/45"><LoaderCircle className="size-4 animate-spin" />正在加载模型…</span> : <SelectValue placeholder="选择总结模型" />}</SelectTrigger><SelectContent>{llmModels.length ? llmModels.map((model: ModelProviderModel): React.ReactNode => <SelectItem key={model.id} value={model.id}>{model.name || model.id}</SelectItem>) : <SelectItem disabled value="__no_llm_models__">暂无总结模型</SelectItem>}</SelectContent></Select><Button aria-label="刷新总结模型" disabled={!llmProviderId || refreshingProviderId === llmProviderId} onClick={(): void => void refreshModels(llmProviderId, 'llm')} size="icon" variant="outline"><RefreshCw className={`size-4 ${loadingCapability === 'llm' ? 'animate-spin' : ''}`} /></Button></div></div>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span>当前组合：转录 <b>{currentAsrLabel}</b>；总结 <b>{currentLlmLabel}</b></span></div>
              <div className="flex justify-end"><Button disabled={saving} onClick={(): void => void saveModelSettings()}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}保存模型配置</Button></div>
            </div>
          )}

        </section>
      </div>
      <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingProviderId ? '编辑模型服务提供者' : '新增模型服务提供者'}</DialogTitle><DialogDescription>API 地址和密钥属于提供者，保存后可以被多个能力模型复用。</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="provider-name">提供者名称</Label><Input id="provider-name" value={providerForm.name} onChange={(event): void => setProviderForm({ ...providerForm, name: event.target.value })} placeholder="例如：公司内部模型 API" /></div>
            <div className="grid gap-2"><Label htmlFor="provider-url">API 地址</Label><Input id="provider-url" value={providerForm.baseUrl} onChange={(event): void => setProviderForm({ ...providerForm, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></div>
            <div className="grid gap-2"><Label htmlFor="provider-key">API Key</Label><Input id="provider-key" type="password" value={providerForm.apiKey} onChange={(event): void => setProviderForm({ ...providerForm, apiKey: event.target.value })} placeholder={editingProviderId ? '已保存；留空则不变' : '请输入 API Key'} /></div>
            <div className="flex items-center justify-between rounded-lg border border-black/8 p-3"><div><Label htmlFor="provider-enabled">启用提供者</Label><p className="mt-1 text-xs text-black/45">关闭后不会出现在模型选择下拉框中。</p></div><Switch aria-label="启用提供者" checked={providerForm.enabled} id="provider-enabled" onCheckedChange={(enabled: boolean): void => setProviderForm({ ...providerForm, enabled })} /></div>
          </div>
          <DialogFooter><Button onClick={(): void => setProviderDialogOpen(false)} variant="outline">取消</Button><Button onClick={(): void => void saveProvider()}><Save className="size-4" />保存提供者</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(deletingProvider)} onOpenChange={(open: boolean): void => { if (!open) setDeletingProvider(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除模型服务提供者？</AlertDialogTitle><AlertDialogDescription>删除后不能再用它发起转录或总结。已被模型配置引用的提供者需要先更换引用。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={(): void => void removeProvider()}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
