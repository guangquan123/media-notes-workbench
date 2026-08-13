import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Cable, CheckCircle2, ChevronDown, ChevronUp, LoaderCircle, LogOut, ScanLine, TriangleAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import type { ConnectorSettingsResponse, ConnectorType, UpdateConnectorRequest } from '@shared/api.interface';
import { completeDingTalkAuth, completeFeishuAuth, getConnectorSettings, initiateDingTalkAuth, initiateFeishuAuth, logoutConnector, setActiveConnector, testConnector, updateConnectorConfig } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const CONNECTOR_OPTIONS: Array<{ label: string; description: string; type: ConnectorType; recommended?: boolean }> = [
  { label: '本地', description: '零配置，数据保存在本机', type: 'local', recommended: true },
  { label: '飞书', description: '文档和待办同步到飞书', type: 'feishu' },
  { label: '钉钉', description: '文档和待办同步到钉钉', type: 'dingtalk' },
];

const STATUS_LABELS: Record<string, string> = { ready: '已就绪', unconfigured: '未配置', disabled: '已禁用', error: '异常' };

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/status code 500/i.test(raw)) return '服务暂时不可用，请稍后重试';
  if (/status code 404/i.test(raw)) return '接口不存在，请重启服务后重试';
  if (/status code 401|403/i.test(raw)) return '登录状态已失效，请重新登录';
  if (/timeout|超时/i.test(raw)) return '请求超时，请稍后重试';
  return raw || '操作失败，请重试';
}

type AuthStatus = 'idle' | 'pending' | 'completed' | 'failed' | 'expired';

export default function ConnectorSettingsPage() {
  const [settings, setSettings] = useState<ConnectorSettingsResponse | null>(null);
  const [selected, setSelected] = useState<ConnectorType>('local');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [useCustomApp, setUseCustomApp] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [authSessionId, setAuthSessionId] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authExpiresAt, setAuthExpiresAt] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const pollTimer = useRef<number | undefined>(undefined);
  const countdownTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void getConnectorSettings().then(setSettings).catch((e: unknown) => setLoadError(friendlyError(e)));
    return () => { if (pollTimer.current) window.clearTimeout(pollTimer.current); if (countdownTimer.current) window.clearInterval(countdownTimer.current); };
  }, []);

  const selectedDescriptor = settings?.items.find((i) => i.type === selected);
  const label = CONNECTOR_OPTIONS.find((o) => o.type === selected)?.label || selected;

  const selectConnector = (type: ConnectorType): void => {
    setSelected(type);
    setClientId(''); setClientSecret(''); setWebhookUrl(''); setUserId('');
    setAuthStatus('idle'); setVerificationUrl(''); setAuthSessionId(''); setAuthMessage(''); setAuthExpiresAt(0); setRemainingSec(0); setAdvancedOpen(false); setUseCustomApp(false);
  };

  const startAuth = async (): Promise<void> => {
    setAuthStatus('pending'); setAuthMessage('正在生成二维码…'); setVerificationUrl(''); setAuthExpiresAt(0);
    try {
      const isFeishu = selected === "feishu";
      const result = isFeishu ? await initiateFeishuAuth(useCustomApp ? clientId : undefined, useCustomApp ? clientSecret : undefined) : await initiateDingTalkAuth();
      if ('alreadyAuthenticated' in result && result.alreadyAuthenticated) {
        setAuthStatus('completed'); setAuthMessage('检测到你已经授权过，无需重复扫码'); toast.success('已授权');
        return;
      }
      setVerificationUrl(result.verificationUrl);
      const sessionId = result.sessionId;
      setAuthSessionId(sessionId);
      setAuthMessage('请用手机扫描下方二维码，并在手机上确认授权');
      const expiresAt = Date.now() + result.expiresIn * 1000;
      setAuthExpiresAt(expiresAt);
      void pollAuth(sessionId);
    } catch (error) {
      setAuthStatus('failed'); setAuthMessage(friendlyError(error));
    }
  };

  const pollAuth = async (sessionId: string): Promise<void> => {
    try {
      const result = selected === "feishu" ? await completeFeishuAuth(sessionId) : await completeDingTalkAuth(sessionId);
      if (result.completed) {
        setAuthStatus('completed'); setAuthMessage('授权成功！下面点击「保存并启用」即可'); toast.success('授权成功');
        setSettings(await getConnectorSettings());
        return;
      }
      if ('code' in result && result.code === 'expired') {
        setAuthStatus('expired'); setAuthMessage(result.message || '二维码已过期，请点击上方按钮重新生成');
        return;
      }
      pollTimer.current = window.setTimeout(() => void pollAuth(sessionId), 3000);
    } catch {
      pollTimer.current = window.setTimeout(() => void pollAuth(sessionId), 3000);
    }
  };

  useEffect(() => {
    if (!authExpiresAt) return;
    countdownTimer.current = window.setInterval(() => {
      const sec = Math.max(0, Math.round((authExpiresAt - Date.now()) / 1000));
      setRemainingSec(sec);
      if (sec <= 0 && authStatus !== "completed") setAuthStatus("expired");
    }, 1000);
    return () => { if (countdownTimer.current) window.clearInterval(countdownTimer.current); };
  }, [authExpiresAt, authStatus]);

  const disconnect = async (): Promise<void> => {
    try {
      await logoutConnector(selected);
      toast.success('已断开授权');
      setAuthStatus('idle'); setVerificationUrl(''); setAuthSessionId(''); setAuthMessage(''); setAuthExpiresAt(0);
      setSettings(await getConnectorSettings());
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const input: UpdateConnectorRequest = { clientId: clientId || undefined, clientSecret: clientSecret || undefined, userId: userId || undefined, enabled: true, webhookUrl: webhookUrl || undefined };
      const next = selected === "local" ? await setActiveConnector("local") : await updateConnectorConfig(selected, input);
      setSettings(next);
      if (selected !== "local") {
        const test = await testConnector(selected);
        if (test.status !== 'success') throw new Error(test.message);
        setSettings(await setActiveConnector(selected));
      }
      toast.success(`${label}连接器已启用`);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally { setSaving(false); }
  };

  const formatRemaining = (sec: number): string => { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; };

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#161616] md:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between border-b border-black/8 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#111315] text-white"><Cable className="size-5" /></div>
            <div><p className="text-sm font-semibold">连接器设置</p><p className="text-xs text-black/45">选择你的笔记、待办和通知保存在哪里</p></div>
          </div>
          <Button asChild size="sm" variant="outline"><Link to="/settings"><ArrowLeft className="size-4" />返回设置</Link></Button>
        </header>

        {loadError && (
          <section className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><div><p className="font-medium">连接器配置暂时无法读取</p><p className="mt-1 break-all">{loadError}</p></div></section>
        )}

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {CONNECTOR_OPTIONS.map((option) => {
            const descriptor = settings?.items.find((i) => i.type === option.type);
            const active = selected === option.type;
            return (
              <button className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#111315] bg-[#111315] text-white" : "border-black/8 bg-white hover:border-black/20"}`} key={option.type} onClick={(): void => selectConnector(option.type)} type="button">
                <div className="flex items-center justify-between"><p className="font-semibold">{option.label}</p>{option.recommended ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">推荐</span> : null}</div>
                <p className={`mt-1 text-xs ${active ? "text-white/65" : "text-black/45"}`}>{option.description}</p>
                <p className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/15 text-white" : "bg-black/5 text-black/55"}`}>{descriptor ? STATUS_LABELS[descriptor.status] || descriptor.status : "读取中"}</p>
              </button>
            );
          })}
        </section>

        <section className="mt-8 space-y-6 rounded-2xl border border-black/8 bg-white p-6">
          <div><h1 className="text-2xl font-semibold">{label}连接器</h1><p className="mt-2 text-sm leading-6 text-black/55">{selected === "local" ? "选择本地后，所有内容保存在这台电脑上，无需任何外部账号，最适合刚开始使用。" : `把${label}作为协作平台，生成的笔记和待办会自动同步过去。`}</p></div>

          {selected === "feishu" && (
            <div className="rounded-xl border border-black/8 bg-white p-4">
              <div className="flex items-start gap-2"><Cable className="mt-0.5 size-4 shrink-0 text-black/55" /><div><p className="font-medium">飞书应用</p><p className="mt-1 text-xs text-black/50">选择扫码授权时使用的飞书应用。</p></div></div>
              <div className="mt-3 grid gap-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${useCustomApp ? "border-black/8" : "border-[#111315] bg-black/[0.02]"}`}>
                  <input checked={!useCustomApp} className="mt-1" onChange={(): void => setUseCustomApp(false)} type="radio" />
                  <span><span className="block text-sm font-medium">使用飞书官方应用（推荐）</span><span className="mt-0.5 block text-xs text-black/50">无需任何配置，直接扫码授权即可。</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${useCustomApp ? "border-[#111315] bg-black/[0.02]" : "border-black/8"}`}>
                  <input checked={useCustomApp} className="mt-1" onChange={(): void => setUseCustomApp(true)} type="radio" />
                  <span><span className="block text-sm font-medium">使用自定义应用</span><span className="mt-0.5 block text-xs text-black/50">使用你在飞书开放平台创建的自建应用。</span></span>
                </label>
              </div>
              {useCustomApp && (
                <div className="mt-3 grid gap-3">
                  <Input onChange={(e): void => setClientId(e.target.value)} placeholder="App ID（通常以 cli_ 开头）" value={clientId} />
                  <Input onChange={(e): void => setClientSecret(e.target.value)} placeholder="App Secret" type="password" value={clientSecret} />
                  <p className="text-xs leading-5 text-black/50">还没有应用？前往 <a className="text-blue-600 underline" href="https://open.feishu.cn/app" rel="noreferrer" target="_blank">飞书开放平台</a> 创建「企业自建应用」，在「凭证与基础信息」里获取 App ID 和 App Secret。</p>
                </div>
              )}
            </div>
          )}

          {selected !== "local" && (
            <div className="rounded-xl border border-black/8 bg-black/[0.02] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2"><ScanLine className="mt-0.5 size-4 shrink-0 text-black/55" /><div><p className="font-medium">授权{label}账号</p><p className="mt-1 text-xs text-black/50">扫码授权后，笔记和待办会同步到你的{label}。</p></div></div>
                <div className="flex gap-2">
                  {authStatus === "completed" && <Button size="sm" variant="outline" onClick={() => void disconnect()}><LogOut className="size-4" />断开</Button>}
                  <Button size="sm" onClick={() => void startAuth()} disabled={authStatus === "pending" && !verificationUrl}>{authStatus === "pending" && !verificationUrl ? <LoaderCircle className="size-4 animate-spin" /> : <ScanLine className="size-4" />}{authStatus === "completed" ? "重新授权" : `扫码授权${label}`}</Button>
                </div>
              </div>

              {verificationUrl && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <div className="rounded-xl bg-white p-3 shadow-sm"><QRCodeSVG value={verificationUrl} size={180} /></div>
                  <a className="break-all text-center text-xs text-blue-600 underline" href={verificationUrl} rel="noreferrer" target="_blank">{verificationUrl}</a>
                  {authStatus === "expired" ? <p className="flex items-center gap-1 text-sm text-red-600"><TriangleAlert className="size-4" />二维码已过期，请点击上方按钮重新生成</p> : authStatus === "completed" ? <p className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="size-4" />{authMessage}</p> : <p className="flex items-center gap-1 text-sm text-black/60">{authStatus === "pending" ? <><LoaderCircle className="size-4 animate-spin" />{authMessage}（{formatRemaining(remainingSec)}）</> : authMessage}</p>}
                </div>
              )}

              {authStatus === "failed" && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><div><p className="font-medium">授权没有成功</p><p className="mt-1 break-all">{authMessage}</p></div></div>
              )}
            </div>
          )}

          {selected !== "local" && (
            <div className="grid gap-4">
              {selected === "dingtalk" && <Input onChange={(e): void => setUserId(e.target.value)} placeholder="钉钉用户 ID（待办执行人，不知道可留空）" value={userId} />}
              <Input onChange={(e): void => setWebhookUrl(e.target.value)} placeholder="机器人 Webhook（可选，用于任务完成通知）" type="url" value={webhookUrl} />
              <button className="flex items-center gap-1 text-left text-xs text-black/45" onClick={(): void => setAdvancedOpen(!advancedOpen)} type="button">{advancedOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}高级设置（一般不用改）</button>
              {advancedOpen && (
                <div className="grid gap-4 rounded-xl bg-black/[0.02] p-4">
                  <Input onChange={(e): void => setClientId(e.target.value)} placeholder="Client ID / App ID（可选）" value={clientId} />
                  <Input onChange={(e): void => setClientSecret(e.target.value)} placeholder="Client Secret（可选）" type="password" value={clientSecret} />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 border-t border-black/8 pt-5">
            <p className="flex items-center gap-2 text-sm text-black/55">{selectedDescriptor?.status === "ready" ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}当前使用：{settings?.activeConnector ? CONNECTOR_OPTIONS.find((o) => o.type === settings.activeConnector)?.label : "读取中"}</p>
            <Button disabled={saving || !settings} onClick={() => void save()}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}保存并启用</Button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-black/8 bg-white p-6">
          <div className="flex items-center gap-2"><BookOpen className="size-4 text-black/55" /><h2 className="font-semibold">{selected === "local" ? "本地模式说明" : `如何连接${label}`}</h2></div>
          <ol className="mt-4 space-y-2 text-sm leading-6 text-black/65">
            {selected === "local" ? ["无需任何账号，文档、待办、通知都保存在本机。", "选择「本地」后点击「保存并启用」即可开始使用。"].map((s) => <li key={s}>{s}</li>) : ["点击「扫码授权」并用手机扫码确认。", "如需任务完成通知，填一个机器人 Webhook（可跳过）。", "点击「保存并启用」完成。"].map((s) => <li key={s}>{s}</li>)}
          </ol>
        </section>
      </div>
    </main>
  );
}
