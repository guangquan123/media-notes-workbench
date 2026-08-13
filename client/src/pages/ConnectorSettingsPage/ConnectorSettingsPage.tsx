import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Cable, CheckCircle2, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ConnectorSettingsResponse,
  ConnectorType,
  UpdateConnectorRequest,
} from '@shared/api.interface';
import {
  getConnectorSettings,
  setActiveConnector,
  testConnector,
  updateConnectorConfig,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const CONNECTOR_OPTIONS: Array<{ label: string; type: ConnectorType }> = [
  { label: '本地', type: 'local' },
  { label: '飞书', type: 'feishu' },
  { label: '钉钉', type: 'dingtalk' },
];

export default function ConnectorSettingsPage() {
  const [settings, setSettings] = useState<ConnectorSettingsResponse | null>(null);
  const [selected, setSelected] = useState<ConnectorType>('local');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getConnectorSettings()
      .then((next) => {
        setSettings(next);
        setSelected(next.activeConnector);
      })
      .catch(() => toast.error('无法读取连接器配置'));
  }, []);

  const selectedDescriptor = settings?.items.find((item) => item.type === selected);
  const selectConnector = (type: ConnectorType): void => {
    setSelected(type);
    setClientId('');
    setClientSecret('');
    setWebhookUrl('');
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const input: UpdateConnectorRequest = {
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
        enabled: true,
        webhookUrl: webhookUrl || undefined,
      };
      const next = selected === 'local'
        ? await setActiveConnector('local')
        : await updateConnectorConfig(selected, input);
      setSettings(next);
      if (selected !== 'local') {
        const result = await testConnector(selected);
        if (result.status !== 'success') throw new Error(result.message);
        setSettings(await setActiveConnector(selected));
      }
      toast.success(`${selectedDescriptor?.label || selected} 连接器已启用`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存连接器配置失败');
    } finally {
      setSaving(false);
    }
  };

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
              <p className="text-xs text-black/45">选择文档、待办、收件箱和通知的协作平台</p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline"><Link to="/settings"><ArrowLeft className="size-4" />返回设置</Link></Button>
        </header>

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {CONNECTOR_OPTIONS.map((option) => {
            const descriptor = settings?.items.find((item) => item.type === option.type);
            return (
              <button
                className={`rounded-2xl border p-4 text-left ${selected === option.type ? 'border-[#111315] bg-[#111315] text-white' : 'border-black/8 bg-white'}`}
                key={option.type}
                onClick={(): void => selectConnector(option.type)}
                type="button"
              >
                <p className="font-semibold">{option.label}</p>
                <p className={`mt-2 text-xs ${selected === option.type ? 'text-white/65' : 'text-black/45'}`}>
                  {descriptor?.status || '读取中'}
                </p>
              </button>
            );
          })}
        </section>

        <section className="mt-8 space-y-6 rounded-2xl border border-black/8 bg-white p-6">
          <div>
            <h1 className="text-2xl font-semibold">{selectedDescriptor?.label || selected}连接器</h1>
            <p className="mt-2 text-sm leading-6 text-black/55">
              本地连接器无需外部账号；飞书和钉钉配置只保存脱敏状态，密钥不会回显。
            </p>
          </div>
          {selected !== 'local' && (
            <div className="grid gap-4">
              <Input onChange={(event): void => setClientId(event.target.value)} placeholder="Client ID / App ID" value={clientId} />
              <Input onChange={(event): void => setClientSecret(event.target.value)} placeholder="Client Secret（留空保留旧值）" type="password" value={clientSecret} />
              <Input onChange={(event): void => setWebhookUrl(event.target.value)} placeholder="机器人 Webhook（可选）" type="url" value={webhookUrl} />
            </div>
          )}
          <div className="flex items-center justify-between gap-4 border-t border-black/8 pt-5">
            <p className="flex items-center gap-2 text-sm text-black/55">
              {selectedDescriptor?.status === 'ready' ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}
              当前主连接器：{settings?.activeConnector || '读取中'}
            </p>
            <Button disabled={saving || !settings} onClick={() => void save()}>
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
              保存并启用
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
