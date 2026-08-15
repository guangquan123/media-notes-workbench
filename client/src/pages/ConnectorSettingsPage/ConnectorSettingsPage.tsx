import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ArrowLeft,
  Cable,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Link2,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ScanLine,
  ShieldCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type {
  ConnectorDescriptor,
  ConnectorSettingsResponse,
  ConnectorStatus,
  ConnectorType,
} from '@shared/api.interface';
import {
  completeDingTalkAuth,
  completeFeishuAuth,
  getConnectorSettings,
  initiateDingTalkAuth,
  initiateFeishuAuth,
  logoutConnector,
  setActiveConnector,
  testConnector,
  updateConnectorConfig,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  getConnectorAction,
  getConnectorStatusLabel,
  hasConnectorDraftChanges,
  validateConnectorDraft,
  type ConnectorDraft,
  type ConnectorDraftErrors,
} from './connector-settings.utils';

const CONNECTOR_OPTIONS: Array<{
  description: string;
  label: string;
  type: ConnectorType;
}> = [
  {
    type: 'local',
    label: '本地',
    description: '数据保存在这台电脑，无需外部账号。',
  },
  {
    type: 'feishu',
    label: '飞书',
    description: '笔记和待办同步到飞书。',
  },
  {
    type: 'dingtalk',
    label: '钉钉',
    description: '笔记和待办同步到钉钉。',
  },
];

const EMPTY_DRAFT: ConnectorDraft = {
  clientId: '',
  clientSecret: '',
  userId: '',
  webhookUrl: '',
};

type AuthState =
  | 'idle'
  | 'requesting'
  | 'waiting'
  | 'completed'
  | 'expired'
  | 'failed';

type TestState = 'idle' | 'running' | 'success' | 'failed';

type Drafts = Record<ConnectorType, ConnectorDraft>;

function createDrafts(): Drafts {
  return {
    local: { ...EMPTY_DRAFT },
    feishu: { ...EMPTY_DRAFT },
    dingtalk: { ...EMPTY_DRAFT },
  };
}

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/status code 500/i.test(raw)) return '服务暂时不可用，请稍后重试。';
  if (/status code 404/i.test(raw))
    return '连接器服务未启动，请重启服务后重试。';
  if (/status code 401|403/i.test(raw)) return '登录状态已失效，请重新登录。';
  if (/timeout|超时/i.test(raw)) return '请求超时，请稍后重试。';
  return raw || '操作失败，请重试。';
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatCheckedAt(value?: string): string {
  if (!value) return '尚未验证';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未验证';
  return `最近验证于 ${date.toLocaleString('zh-CN', { hour12: false })}`;
}

function getLabel(type: ConnectorType): string {
  return (
    CONNECTOR_OPTIONS.find((option) => option.type === type)?.label || type
  );
}

function getStatusTone(status: ConnectorStatus, active: boolean): string {
  if (active || status === 'ready')
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-800';
  if (status === 'disabled')
    return 'border-black/10 bg-black/[0.04] text-black/55';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function StatusPill({
  active,
  status,
}: {
  active: boolean;
  status: ConnectorStatus;
}): ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusTone(status, active)}`}
    >
      {active || status === 'ready' ? (
        <CheckCircle2 className="size-3.5" />
      ) : null}
      {getConnectorStatusLabel(status, active)}
    </span>
  );
}

function FieldError({ message }: { message?: string }): ReactElement | null {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-700">{message}</p>;
}

export default function ConnectorSettingsPage(): ReactElement {
  const [settings, setSettings] = useState<ConnectorSettingsResponse | null>(
    null,
  );
  const [selected, setSelected] = useState<ConnectorType>('local');
  const [drafts, setDrafts] = useState<Drafts>(createDrafts);
  const [useCustomFeishuApp, setUseCustomFeishuApp] = useState(false);
  const [authState, setAuthState] = useState<AuthState>('idle');
  const [authMessage, setAuthMessage] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [authExpiresAt, setAuthExpiresAt] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [draftErrors, setDraftErrors] = useState<ConnectorDraftErrors>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const pollTimer = useRef<number | undefined>(undefined);
  const countdownTimer = useRef<number | undefined>(undefined);

  const loadSettings = async (isRetry = false): Promise<void> => {
    if (isRetry) setRetrying(true);
    else setLoading(true);
    setLoadError('');
    try {
      const next = await getConnectorSettings();
      setSettings(next);
      setSelected(next.activeConnector);
    } catch (error) {
      setLoadError(friendlyError(error));
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  useEffect(() => {
    void loadSettings();
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
      if (countdownTimer.current) window.clearInterval(countdownTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!authExpiresAt) return undefined;
    countdownTimer.current = window.setInterval(() => {
      const next = Math.max(0, Math.round((authExpiresAt - Date.now()) / 1000));
      setRemainingSeconds(next);
      if (next <= 0 && authState === 'waiting') {
        setAuthState('expired');
        setAuthMessage('二维码已过期，请重新生成。');
      }
    }, 1000);
    return () => {
      if (countdownTimer.current) window.clearInterval(countdownTimer.current);
    };
  }, [authExpiresAt, authState]);

  const selectedDescriptor: ConnectorDescriptor | undefined = useMemo(
    () => settings?.items.find((item) => item.type === selected),
    [selected, settings],
  );
  const draft = drafts[selected];
  const activeLabel = settings ? getLabel(settings.activeConnector) : '读取中';
  const hasReadyConnection = selectedDescriptor?.status === 'ready';
  const active = settings?.activeConnector === selected;
  const action = getConnectorAction(
    selected,
    selectedDescriptor?.status || 'unconfigured',
    Boolean(active),
  );

  const updateDraft = (field: keyof ConnectorDraft, value: string): void => {
    setDrafts((previous) => ({
      ...previous,
      [selected]: { ...previous[selected], [field]: value },
    }));
    setDraftErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const selectConnector = (type: ConnectorType): void => {
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
    setSelected(type);
    setAuthState('idle');
    setAuthMessage('');
    setVerificationUrl('');
    setAuthExpiresAt(0);
    setRemainingSeconds(0);
    setTestState('idle');
    setTestMessage('');
    setDraftErrors({});
    setShowAdvanced(false);
  };

  const refreshAfterAction = async (): Promise<ConnectorSettingsResponse> => {
    const next = await getConnectorSettings();
    setSettings(next);
    return next;
  };

  const verifyConnection = async (): Promise<boolean> => {
    setTestState('running');
    setTestMessage('正在检查授权和连接能力…');
    try {
      const result = await testConnector(selected);
      await refreshAfterAction();
      if (result.status !== 'success') {
        setTestState('failed');
        setTestMessage(result.message);
        return false;
      }
      setTestState('success');
      setTestMessage(result.message);
      return true;
    } catch (error) {
      setTestState('failed');
      setTestMessage(friendlyError(error));
      return false;
    }
  };

  const pollAuth = async (sessionId: string): Promise<void> => {
    try {
      const result =
        selected === 'feishu'
          ? await completeFeishuAuth(sessionId)
          : await completeDingTalkAuth(sessionId);
      if (result.completed) {
        setAuthState('completed');
        setAuthMessage('授权成功，正在验证连接能力…');
        const verified = await verifyConnection();
        if (verified) {
          setAuthMessage('授权和连接验证均已完成。');
          toast.success(`${getLabel(selected)}已连接`);
        }
        return;
      }
      if ('code' in result && result.code === 'expired') {
        setAuthState('expired');
        setAuthMessage(result.message || '授权会话已过期，请重新生成二维码。');
        return;
      }
      pollTimer.current = window.setTimeout(
        () => void pollAuth(sessionId),
        3000,
      );
    } catch {
      pollTimer.current = window.setTimeout(
        () => void pollAuth(sessionId),
        3000,
      );
    }
  };

  const startAuth = async (): Promise<void> => {
    const errors = validateConnectorDraft(
      selected,
      draft,
      selected === 'feishu' && useCustomFeishuApp,
    );
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setAuthState('requesting');
    setAuthMessage('正在生成授权二维码…');
    setVerificationUrl('');
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
    try {
      const result =
        selected === 'feishu'
          ? await initiateFeishuAuth(
              useCustomFeishuApp ? draft.clientId : undefined,
              useCustomFeishuApp ? draft.clientSecret : undefined,
            )
          : await initiateDingTalkAuth();
      if (result.alreadyAuthenticated) {
        setAuthState('completed');
        setAuthMessage('检测到已有授权，正在验证连接能力…');
        const verified = await verifyConnection();
        if (verified) toast.success(`${getLabel(selected)}已连接`);
        return;
      }
      setAuthState('waiting');
      setVerificationUrl(result.verificationUrl);
      setAuthExpiresAt(Date.now() + result.expiresIn * 1000);
      setRemainingSeconds(result.expiresIn);
      setAuthMessage('请用手机扫码并在手机上确认授权。');
      void pollAuth(result.sessionId);
    } catch (error) {
      setAuthState('failed');
      setAuthMessage(friendlyError(error));
    }
  };

  const toggleConnector = async (
    type: ConnectorType,
    enabled: boolean,
  ): Promise<void> => {
    if (!enabled && settings?.activeConnector === type) {
      toast.error('当前正在使用，请先切换到其他连接器');
      return;
    }
    setSaving(true);
    try {
      const next = await updateConnectorConfig(type, { enabled });
      setSettings(next);
      if (selected === type && !enabled) {
        setAuthState('idle');
        setAuthMessage('');
        setVerificationUrl('');
        setTestState('idle');
        setTestMessage('');
      }
      toast.success(`${getLabel(type)}已${enabled ? '开启' : '关闭'}`);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const activateSelected = async (): Promise<void> => {
    if (!settings || action === 'active') return;
    if (selected !== 'local' && !hasReadyConnection) {
      setAuthMessage(`请先完成${getLabel(selected)}授权并通过连接验证。`);
      setAuthState('failed');
      return;
    }
    setSaving(true);
    try {
      setSettings(await setActiveConnector(selected));
      toast.success(`${getLabel(selected)}已设为当前使用`);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const saveOptionalSettings = async (): Promise<void> => {
    const errors = validateConnectorDraft(
      selected,
      draft,
      selected === 'feishu' && useCustomFeishuApp,
    );
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (selected === 'local') {
      await activateSelected();
      return;
    }
    setSaving(true);
    try {
      await updateConnectorConfig(selected, {
        clientId: draft.clientId || undefined,
        clientSecret: draft.clientSecret || undefined,
        enabled: true,
        userId: draft.userId || undefined,
        webhookUrl: draft.webhookUrl || undefined,
      });
      await refreshAfterAction();
      if (hasReadyConnection) await verifyConnection();
      toast.success('可选设置已保存');
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    setSaving(true);
    try {
      await logoutConnector(selected);
      await refreshAfterAction();
      setAuthState('idle');
      setAuthMessage('');
      setVerificationUrl('');
      setTestState('idle');
      setTestMessage('');
      toast.success(`已断开${getLabel(selected)}授权`);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const copyVerificationUrl = async (): Promise<void> => {
    if (!verificationUrl) return;
    try {
      await navigator.clipboard.writeText(verificationUrl);
      toast.success('授权链接已复制');
    } catch {
      toast.error('复制失败，请直接打开下方链接');
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#161616] md:px-10">
        <div className="mx-auto max-w-5xl animate-pulse space-y-6">
          <div className="h-16 rounded-2xl bg-black/[0.06]" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div className="h-28 rounded-2xl bg-black/[0.06]" key={item} />
            ))}
          </div>
          <div className="h-[34rem] rounded-2xl bg-black/[0.06]" />
        </div>
      </main>
    );
  }

  if (loadError || !settings) {
    return (
      <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#161616] md:px-10">
        <div className="mx-auto max-w-3xl">
          <header className="flex items-center justify-between border-b border-black/8 pb-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-[#111315] text-white">
                <Cable className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">连接器设置</p>
                <p className="text-xs text-black/45">
                  管理内容的保存和同步位置
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings">
                <ArrowLeft className="size-4" />
                返回设置
              </Link>
            </Button>
          </header>
          <section className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <div>
                <h1 className="font-semibold">暂时无法读取连接器配置</h1>
                <p className="mt-2 text-sm leading-6 text-red-800">
                  {loadError || '连接器服务没有返回配置。'}
                </p>
                <Button
                  className="mt-5 bg-white text-red-900 hover:bg-red-100"
                  disabled={retrying}
                  onClick={() => void loadSettings(true)}
                  variant="outline"
                >
                  {retrying ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  重新加载
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#161616] md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 border-b border-black/8 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#111315] text-white">
              <Cable className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">连接方式</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                连接器
              </h1>
              <p className="mt-2 text-sm text-black/55">
                选择一个连接器作为当前使用方式。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-black/45">当前使用</p>
              <p className="mt-1 text-sm font-semibold">{activeLabel}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings">
                <ArrowLeft className="size-4" />
                返回设置
              </Link>
            </Button>
          </div>
        </header>

        <section
          className="mt-7 grid gap-3 sm:grid-cols-3"
          aria-label="连接器列表"
        >
          {CONNECTOR_OPTIONS.map((option) => {
            const descriptor = settings.items.find(
              (item) => item.type === option.type,
            );
            const isSelected = option.type === selected;
            const isActive = settings.activeConnector === option.type;
            const status = descriptor?.status || 'unconfigured';
            return (
              <div
                className={`rounded-2xl border p-4 transition ${isSelected ? 'border-[#111315] bg-[#111315] text-white shadow-lg' : 'border-black/8 bg-white hover:border-black/20'}`}
                key={option.type}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    aria-pressed={isSelected}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111315] focus-visible:ring-offset-2"
                    onClick={() => selectConnector(option.type)}
                    type="button"
                  >
                    <p className="font-semibold">{option.label}</p>
                    <p
                      className={`mt-1 text-xs ${isSelected ? 'text-white/65' : 'text-black/50'}`}
                    >
                      {option.description}
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Switch
                      aria-label={`${option.label}${descriptor?.enabled ? '已开启' : '已关闭'}`}
                      checked={descriptor?.enabled ?? option.type === 'local'}
                      disabled={saving || isActive}
                      onCheckedChange={(checked: boolean) =>
                        void toggleConnector(option.type, checked)
                      }
                    />
                    <span
                      className={`text-[11px] ${isSelected ? 'text-white/55' : 'text-black/45'}`}
                    >
                      {isActive
                        ? '当前使用'
                        : descriptor?.enabled
                          ? '已开启'
                          : '已关闭'}
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span
                    className={`text-xs ${isSelected ? 'text-white/60' : 'text-black/45'}`}
                  >
                    {isSelected ? '正在配置' : '点击配置'}
                  </span>
                  <span className={isSelected ? 'text-white' : ''}>
                    <StatusPill active={false} status={status} />
                  </span>
                </div>
              </div>
            );
          })}
        </section>

        <section
          className="mt-7 overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm"
          aria-live="polite"
        >
          <div className="border-b border-black/8 px-6 py-6 md:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold">
                    {getLabel(selected)}连接器
                  </h2>
                  <StatusPill
                    active={Boolean(active)}
                    status={selectedDescriptor?.status || 'unconfigured'}
                  />
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
                  {selected === 'local'
                    ? '所有文档、待办和通知保存在本机，不需要外部账号。'
                    : `连接${getLabel(selected)}后，生成的笔记和待办可以同步到你的协作平台。`}
                </p>
              </div>
              {selectedDescriptor?.lastError ? (
                <span className="max-w-xs text-right text-xs leading-5 text-red-700">
                  {selectedDescriptor.lastError}
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-7 px-6 py-7 md:px-8">
            {selected === 'local' ? (
              <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="font-semibold">本地模式随时可用</p>
                      <p className="mt-1 text-sm leading-6 text-emerald-900/75">
                        数据不会离开这台电脑。你可以直接开始处理资料，也可以稍后切换到飞书或钉钉。
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  className="h-11 min-w-44"
                  disabled={saving || active}
                  onClick={() => void activateSelected()}
                >
                  {saving ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {active ? '当前使用中' : '启用本地'}
                </Button>
              </div>
            ) : !selectedDescriptor?.enabled ? (
              <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{getLabel(selected)}已关闭</p>
                  <p className="mt-1 text-sm text-amber-900/75">
                    打开上方开关后，才能继续配置和使用。
                  </p>
                </div>
                <Button
                  disabled={saving}
                  onClick={() => void toggleConnector(selected, true)}
                  size="sm"
                >
                  <CheckCircle2 className="size-4" />
                  开启连接器
                </Button>
              </div>
            ) : (
              <>
                {selected === 'feishu' ? (
                  <section
                    className="space-y-4"
                    aria-labelledby="feishu-app-title"
                  >
                    <div>
                      <h3 className="font-semibold" id="feishu-app-title">
                        选择飞书应用
                      </h3>
                      <p className="mt-1 text-sm text-black/50">
                        默认使用官方应用，需要企业权限时再切换自定义应用。
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label
                        className={`cursor-pointer rounded-xl border p-4 transition ${!useCustomFeishuApp ? 'border-[#111315] bg-black/[0.02]' : 'border-black/8 hover:border-black/20'}`}
                      >
                        <input
                          checked={!useCustomFeishuApp}
                          className="sr-only"
                          name="feishu-app"
                          onChange={() => setUseCustomFeishuApp(false)}
                          type="radio"
                        />
                        <span className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 grid size-5 place-items-center rounded-full border ${!useCustomFeishuApp ? 'border-[#111315] bg-[#111315] text-white' : 'border-black/20'}`}
                          >
                            {!useCustomFeishuApp ? (
                              <Check className="size-3" />
                            ) : null}
                          </span>
                          <span>
                            <span className="block text-sm font-semibold">
                              官方应用
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-black/50">
                              无需填写凭据，直接扫码。
                            </span>
                          </span>
                        </span>
                      </label>
                      <label
                        className={`cursor-pointer rounded-xl border p-4 transition ${useCustomFeishuApp ? 'border-[#111315] bg-black/[0.02]' : 'border-black/8 hover:border-black/20'}`}
                      >
                        <input
                          checked={useCustomFeishuApp}
                          className="sr-only"
                          name="feishu-app"
                          onChange={() => setUseCustomFeishuApp(true)}
                          type="radio"
                        />
                        <span className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 grid size-5 place-items-center rounded-full border ${useCustomFeishuApp ? 'border-[#111315] bg-[#111315] text-white' : 'border-black/20'}`}
                          >
                            {useCustomFeishuApp ? (
                              <Check className="size-3" />
                            ) : null}
                          </span>
                          <span>
                            <span className="block text-sm font-semibold">
                              自定义应用
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-black/50">
                              使用企业自建应用的凭据。
                            </span>
                          </span>
                        </span>
                      </label>
                    </div>
                    {useCustomFeishuApp ? (
                      <div className="grid gap-4 rounded-xl bg-black/[0.025] p-4 md:grid-cols-2">
                        <label className="text-sm font-medium">
                          App ID
                          <Input
                            aria-invalid={Boolean(draftErrors.clientId)}
                            className="mt-2 bg-white"
                            onChange={(event) =>
                              updateDraft('clientId', event.target.value)
                            }
                            placeholder="cli_xxxxxxxxx"
                            value={draft.clientId}
                          />
                          <FieldError message={draftErrors.clientId} />
                        </label>
                        <label className="text-sm font-medium">
                          App Secret
                          <Input
                            aria-invalid={Boolean(draftErrors.clientSecret)}
                            className="mt-2 bg-white"
                            onChange={(event) =>
                              updateDraft('clientSecret', event.target.value)
                            }
                            placeholder="输入 App Secret"
                            type="password"
                            value={draft.clientSecret}
                          />
                          <FieldError message={draftErrors.clientSecret} />
                        </label>
                        <p className="text-xs leading-5 text-black/50 md:col-span-2">
                          还没有应用？前往
                          <a
                            className="mx-1 text-blue-700 underline"
                            href="https://open.feishu.cn/app"
                            rel="noreferrer"
                            target="_blank"
                          >
                            飞书开放平台{' '}
                            <ExternalLink className="inline size-3" />
                          </a>
                          创建企业自建应用。
                        </p>
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <section aria-labelledby="dingtalk-app-title">
                    <h3 className="font-semibold" id="dingtalk-app-title">
                      准备钉钉授权
                    </h3>
                    <p className="mt-1 text-sm text-black/50">
                      使用钉钉手机端确认授权，无需填写 App ID 或 App Secret。
                    </p>
                  </section>
                )}

                <section
                  className="rounded-xl border border-black/8 bg-black/[0.02] p-5"
                  aria-labelledby="auth-title"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <ScanLine className="mt-0.5 size-5 shrink-0 text-black/60" />
                      <div>
                        <h3 className="font-semibold" id="auth-title">
                          扫码授权
                        </h3>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {authState === 'completed' || hasReadyConnection ? (
                        <Button
                          disabled={saving}
                          onClick={() => void disconnect()}
                          size="sm"
                          variant="outline"
                        >
                          <LogOut className="size-4" />
                          断开授权
                        </Button>
                      ) : null}
                      <Button
                        disabled={
                          authState === 'requesting' || authState === 'waiting'
                        }
                        onClick={() => void startAuth()}
                        size="sm"
                      >
                        {authState === 'requesting' ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <ScanLine className="size-4" />
                        )}
                        {authState === 'completed' || hasReadyConnection
                          ? '重新授权'
                          : `扫码连接${getLabel(selected)}`}
                      </Button>
                    </div>
                  </div>

                  {verificationUrl ? (
                    <div className="mt-5 grid gap-5 border-t border-black/8 pt-5 md:grid-cols-[auto_1fr] md:items-center">
                      <div className="mx-auto rounded-xl bg-white p-3 shadow-sm">
                        <QRCodeSVG
                          value={verificationUrl}
                          size={184}
                          aria-label={`${getLabel(selected)}授权二维码`}
                        />
                      </div>
                      <div className="space-y-3 text-center md:text-left">
                        <div>
                          <p className="font-medium">请用手机扫码确认</p>
                          <p className="mt-1 text-sm text-black/50">
                            二维码有效期还剩 {formatRemaining(remainingSeconds)}
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                          <Button
                            onClick={() => void copyVerificationUrl()}
                            size="sm"
                            variant="outline"
                          >
                            <Link2 className="size-4" />
                            复制授权链接
                          </Button>
                        </div>
                        <p
                          className={`flex items-center justify-center gap-2 text-sm md:justify-start ${authState === 'failed' || authState === 'expired' ? 'text-red-700' : authState === 'completed' ? 'text-emerald-700' : 'text-black/55'}`}
                        >
                          {authState === 'waiting' ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : authState === 'completed' ? (
                            <CheckCircle2 className="size-4" />
                          ) : authState === 'failed' ||
                            authState === 'expired' ? (
                            <CircleAlert className="size-4" />
                          ) : null}
                          {authState === 'expired'
                            ? '二维码已过期，请重新生成。'
                            : authMessage || '等待授权确认。'}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {!verificationUrl && authState === 'failed' ? (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" />
                      <span>{authMessage || '授权失败，请重试。'}</span>
                    </div>
                  ) : null}
                </section>

                <section aria-labelledby="connection-test-title">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold" id="connection-test-title">
                        连接状态
                      </h3>
                    </div>
                    <Button
                      disabled={testState === 'running' || !hasReadyConnection}
                      onClick={() => void verifyConnection()}
                      size="sm"
                      variant="outline"
                    >
                      {testState === 'running' ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      重新验证
                    </Button>
                  </div>
                  <div
                    className={`mt-3 rounded-xl border p-4 ${testState === 'failed' ? 'border-red-200 bg-red-50 text-red-900' : testState === 'success' || hasReadyConnection ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-black/8 bg-black/[0.02] text-black/55'}`}
                  >
                    <div className="flex items-start gap-3">
                      {testState === 'failed' ? (
                        <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-700" />
                      ) : testState === 'success' || hasReadyConnection ? (
                        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
                      ) : (
                        <Cable className="mt-0.5 size-5 shrink-0 text-black/40" />
                      )}
                      <div>
                        <p className="font-medium">
                          {testState === 'failed'
                            ? '连接验证失败'
                            : testState === 'running'
                              ? '正在验证连接'
                              : testState === 'success' || hasReadyConnection
                                ? '连接验证通过'
                                : '等待授权完成'}
                        </p>
                        <p className="mt-1 text-sm opacity-75">
                          {testMessage ||
                            formatCheckedAt(selectedDescriptor?.lastCheckedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section
                  className="border-t border-black/8 pt-4"
                  aria-labelledby="optional-settings-title"
                >
                  <Button
                    aria-expanded={showAdvanced}
                    className="px-0 text-black/65 hover:bg-transparent hover:text-black"
                    onClick={() => setShowAdvanced((value) => !value)}
                    size="sm"
                    variant="ghost"
                  >
                    <ChevronDown
                      className={`size-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                    />
                    高级设置
                  </Button>
                  {showAdvanced ? (
                    <div className="mt-4 grid gap-4 rounded-xl bg-black/[0.025] p-4 md:grid-cols-2">
                      {selected === 'dingtalk' ? (
                        <label className="text-sm font-medium">
                          待办执行人 ID
                          <Input
                            className="mt-2 bg-white"
                            onChange={(event) =>
                              updateDraft('userId', event.target.value)
                            }
                            placeholder="可留空，默认使用授权身份"
                            value={draft.userId}
                          />
                        </label>
                      ) : null}
                      <label className="text-sm font-medium md:col-span-2">
                        任务完成通知 Webhook
                        <Input
                          aria-invalid={Boolean(draftErrors.webhookUrl)}
                          className="mt-2 bg-white"
                          onChange={(event) =>
                            updateDraft('webhookUrl', event.target.value)
                          }
                          placeholder="https://…（可选）"
                          type="url"
                          value={draft.webhookUrl}
                        />
                        <FieldError message={draftErrors.webhookUrl} />
                      </label>
                    </div>
                  ) : null}
                </section>

                <div className="flex flex-col gap-3 border-t border-black/8 pt-6 sm:flex-row sm:items-center sm:justify-end">
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {hasConnectorDraftChanges(draft) ? (
                      <Button
                        disabled={saving}
                        onClick={() => void saveOptionalSettings()}
                        variant="outline"
                      >
                        {saving ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        保存可选设置
                      </Button>
                    ) : null}
                    <Button
                      disabled={
                        saving || action === 'active' || !hasReadyConnection
                      }
                      onClick={() => void activateSelected()}
                    >
                      {saving ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : action === 'active' ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <Cable className="size-4" />
                      )}
                      {action === 'active' ? '当前使用中' : '设为当前使用'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
