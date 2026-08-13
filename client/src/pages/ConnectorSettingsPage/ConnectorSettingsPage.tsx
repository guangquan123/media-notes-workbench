import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Cable, CheckCircle2, LoaderCircle, ScanLine, TriangleAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import type {
  ConnectorSettingsResponse,
  ConnectorType,
  UpdateConnectorRequest,
} from '@shared/api.interface';
import {
  completeDingTalkAuth,
  completeFeishuAuth,
  getConnectorSettings,
  initiateDingTalkAuth,
  initiateFeishuAuth,
  setActiveConnector,
  testConnector,
  updateConnectorConfig,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const CONNECTOR_OPTIONS: Array<{ label: string; description: string; type: ConnectorType }> = [
  { label: '本地', description: '零配置，数据保存在本机', type: 'local' },
  { label: '飞书', description: '文档和待办使用飞书', type: 'feishu' },
  { label: '钉钉', description: '文档和待办使用钉钉', type: 'dingtalk' },
];

const STATUS_LABELS: Record<string, string> = {
  ready: '已就绪',
  unconfigured: '未配置',
  disabled: '已禁用',
  error: '异常',
};

const CONNECTOR_GUIDES: Record<ConnectorType, { title: string; steps: string[]; hint: string }> = {
  local: {
    title: '本地模式（推荐先从这里开始）',
    steps: [
      '无需注册任何账号，文档、待办、通知都保存在你自己的电脑上。',
      '选择「本地」后点击「保存并启用」，马上就能用。',
    ],
    hint: '如果你暂时不用飞书或钉钉，先选本地就能开箱即用。',
  },
  feishu: {
    title: '如何连接飞书',
    steps: [
      '1. 点击下方「扫码授权飞书」，用手机飞书扫一下二维码并确认授权。',
      '2. 如果想在任务完成时收到通知，再填一个飞书机器人 Webhook（可跳过）。',
      '3. 点击「保存并启用」完成。',
    ],
    hint: '授权成功后，生成的笔记会自动写入你的飞书文档，待办也会同步到你的飞书任务。',
  },
  dingtalk: {
    title: '如何连接钉钉',
    steps: [
      '1. 点击下方「扫码授权钉钉」，用手机钉钉扫一下二维码并确认授权。',
      '2. 填写你的钉钉用户 ID（待办执行人），不知道的话先留空也能保存。',
      '3. 如需通知，再填一个钉钉机器人 Webhook（可跳过）。',
      '4. 点击「保存并启用」完成。',
    ],
    hint: '授权成功后，生成的笔记会写入你的钉钉文档，待办会同步到你的钉钉待办。',
  },
};

type AuthStatus = 'idle' | 'pending' | 'completed' | 'failed';

export default function ConnectorSettingsPage() {
  const [settings, setSettings] = useState<ConnectorSettingsResponse | null>(null);
  const [selected, setSelected] = useState<ConnectorType>('local');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [authDeviceCode, setAuthDeviceCode] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const pollTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void getConnectorSettings()
      .then((next) => {
        setSettings(next);
        setSelected(next.activeConnector);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '未知错误';
        setLoadError(message);
      });
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

  const selectedDescriptor = settings?.items.find((item) => item.type === selected);
  const guide = CONNECTOR_GUIDES[selected];

  const selectConnector = (type: ConnectorType): void => {
    setSelected(type);
    setClientId(''); setClientSecret(''); setWebhookUrl(''); setUserId('');
    setAuthStatus('idle'); setVerificationUrl(''); setAuthDeviceCode(''); setAuthMessage('');
  };

  const startAuth = async (): Promise<void> => {
    setAuthStatus('pending');
    setAuthMessage('正在生成二维码…');
    try {
      const result = selected === "feishu" ? await initiateFeishuAuth() : await initiateDingTalkAuth();
      setVerificationUrl(result.verificationUrl);
      if ("deviceCode" in result) setAuthDeviceCode(result.deviceCode);
      setAuthMessage('请用手机「飞书」或「钉钉」扫描下方二维码，并在手机上点击授权。');
      void pollAuth();
    } catch (error) {
      setAuthStatus('failed');
      setAuthMessage(error instanceof Error ? error.message : '生成二维码失败');
    }
  };

  const pollAuth = async (): Promise<void> => {
    try {
      const result = selected === "feishu" ? await completeFeishuAuth(authDeviceCode) : await completeDingTalkAuth();
      if (result.completed) {
        setAuthStatus('completed');
        setAuthMessage('授权成功！现在可以填写通知配置，或直接点击「保存并启用」。');
        toast.success("授权成功");
        setSettings(await getConnectorSettings());
        return;
      }
      pollTimer.current = window.setTimeout(() => void pollAuth(), 3000);
    } catch {
      pollTimer.current = window.setTimeout(() => void pollAuth(), 3000);
    }
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const input: UpdateConnectorRequest = {
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
        userId: userId || undefined,
        enabled: true,
        webhookUrl: webhookUrl || undefined,
      };
      const next = selected === "local" ? await setActiveConnector("local") : await updateConnectorConfig(selected, input);
      setSettings(next);
      if (selected !== "local") {
        const result = await testConnector(selected);
        if (result.status !== 'success') throw new Error(result.message);
        setSettings(await setActiveConnector(selected));
      }
      toast.success(`${selectedDescriptor?.label || selected} 连接器已启用`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const connectorLabel = (type: ConnectorType): string => CONNECTOR_OPTIONS.find((o) => o.type === type)?.label || type;

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#161616] md:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between border-b border-black/8 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#111315] text-white"><Cable className="size-5" /></div>
            <div>
              <p className="text-sm font-semibold">连接器设置</p>
              <p className="text-xs text-black/45">选择你的笔记、待办和通知保存在哪里</p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline"><Link to="/settings"><ArrowLeft className="size-4" />返回设置</Link></Button>
        </header>

        {loadError && (
          <section className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div><p className="font-medium">连接器配置暂时无法读取</p><p className="mt-1 break-all">{loadError}</p></div>
          </section>
        )}

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {CONNECTOR_OPTIONS.map((option) => {
            const descriptor = settings?.items.find((item) => item.type === option.type);
            const active = selected === option.type;
            return (
              <button
                className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#111315] bg-[#111315] text-white" : "border-black/8 bg-white hover:border-black/20"}`}
                key={option.type}
                onClick={(): void => selectConnector(option.type)}
                type="button"
              >
                <p className="font-semibold">{option.label}</p>
                <p className={`mt-1 text-xs ${active ? "text-white/65" : "text-black/45"}`}>{option.description}</p>
                <p className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/15 text-white" : "bg-black/5 text-black/55"}`}>
                  {descriptor ? STATUS_LABELS[descriptor.status] || descriptor.status : "读取中"}
                </p>
              </button>
            );
          })}
        </section>

        <section className="mt-8 space-y-6 rounded-2xl border border-black/8 bg-white p-6">
          <div>
            <h1 className="text-2xl font-semibold">{connectorLabel(selected)}连接器</h1>
            <p className="mt-2 text-sm leading-6 text-black/55">
              {selected === "local" ? "选择本地后，你的所有内容都保存在这台电脑上，不需要任何外部账号。" : `把${connectorLabel(selected)}作为你的协作平台，生成的笔记和待办会同步过去。`}
            </p>
          </div>

          {selected !== "local" && (
            <div className="rounded-xl border border-black/8 bg-black/[0.02] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <ScanLine className="mt-0.5 size-4 shrink-0 text-black/55" />
                  <div>
                    <p className="font-medium">授权{connectorLabel(selected)}账号</p>
                    <p className="mt-1 text-xs text-black/50">授权后，笔记和待办会自动同步到你的{connectorLabel(selected)}。</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => void startAuth()} disabled={authStatus === "pending" && !verificationUrl}>
                  {authStatus === "pending" && !verificationUrl ? <LoaderCircle className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
                  {authStatus === "completed" ? "重新授权" : `扫码授权${connectorLabel(selected)}`}
                </Button>
              </div>

              {verificationUrl && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <div className="rounded-xl bg-white p-3 shadow-sm"><QRCodeSVG value={verificationUrl} size={180} /></div>
                  <a className="break-all text-center text-xs text-blue-600 underline" href={verificationUrl} rel="noreferrer" target="_blank">{verificationUrl}</a>
                  {authStatus === "completed" ? (
                    <p className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="size-4" />{authMessage}</p>
                  ) : (
                    <p className="flex items-center gap-1 text-sm text-black/60">{authStatus === "pending" ? <><LoaderCircle className="size-4 animate-spin" />{authMessage}</> : authMessage}</p>
                  )}
                </div>
              )}

              {authStatus === "failed" && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <div><p className="font-medium">授权没有成功</p><p className="mt-1 break-all">{authMessage}</p><p className="mt-1 text-xs">请点击上方按钮重试。</p></div>
                </div>
              )}
            </div>
          )}

          {selected !== "local" && (
            <div className="grid gap-4">
              {selected === "dingtalk" && <Input onChange={(event): void => setUserId(event.target.value)} placeholder="钉钉用户 ID（待办执行人，可留空）" value={userId} />}
              <Input onChange={(event): void => setClientId(event.target.value)} placeholder="Client ID / App ID（可选，一般不用填）" value={clientId} />
              <Input onChange={(event): void => setClientSecret(event.target.value)} placeholder="Client Secret（可选，留空保留旧值）" type="password" value={clientSecret} />
              <Input onChange={(event): void => setWebhookUrl(event.target.value)} placeholder="机器人 Webhook（可选，用于任务通知）" type="url" value={webhookUrl} />
            </div>
          )}

          <div className="flex items-center justify-between gap-4 border-t border-black/8 pt-5">
            <p className="flex items-center gap-2 text-sm text-black/55">
              {selectedDescriptor?.status === "ready" ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}
              当前使用：{settings?.activeConnector ? connectorLabel(settings.activeConnector) : "读取中"}
            </p>
            <Button disabled={saving || !settings} onClick={() => void save()}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}保存并启用</Button>
          </div>
        </section>

        {guide && (
          <section className="mt-6 rounded-2xl border border-black/8 bg-white p-6">
            <div className="flex items-center gap-2"><BookOpen className="size-4 text-black/55" /><h2 className="font-semibold">{guide.title}</h2></div>
            <ol className="mt-4 space-y-2 text-sm leading-6 text-black/65">{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            <p className="mt-4 rounded-xl bg-black/4 p-3 text-xs leading-5 text-black/50">{guide.hint}</p>
          </section>
        )}
      </div>
    </main>
  );
}
