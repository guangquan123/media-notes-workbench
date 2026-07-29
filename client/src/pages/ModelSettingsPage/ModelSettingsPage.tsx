import { ArrowLeft, CheckCircle2, CloudCog, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { ExternalModelSettings } from '@shared/api.interface';
import {
  getExternalModelSettings,
  testExternalModelConnection,
  updateExternalModelSettings,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface FormState {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  model: string;
}

interface ModelSettingsPageProps {
  embedded?: boolean;
}

function toFormState(settings: ExternalModelSettings): FormState {
  return { apiKey: '', baseUrl: settings.baseUrl, enabled: settings.enabled, model: settings.model };
}

export default function ModelSettingsPage({
  embedded = false,
}: ModelSettingsPageProps) {
  const [settings, setSettings] = useState<ExternalModelSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect((): void => {
    void getExternalModelSettings().then((next: ExternalModelSettings): void => {
      setSettings(next); setForm(toFormState(next)); setEditing(!next.configured);
    }).catch((): void => {
      toast.error('无法读取外部模型配置');
    });
  }, []);

  const update = (patch: Partial<FormState>): void => {
    setForm((current: FormState | null): FormState | null => current ? { ...current, ...patch } : current);
  };

  const save = async (): Promise<void> => {
    if (!form) return;
    setSaving(true);
    try {
      const next = await updateExternalModelSettings(form);
      setSettings(next); setForm(toFormState(next)); setEditing(false);
      toast.success(next.enabled ? `${next.model} 已启用` : '外部模型已关闭，配置已保留');
    } catch {
      toast.error('保存失败，请核对地址、模型名和 API Key');
    } finally { setSaving(false); }
  };

  const test = async (): Promise<void> => {
    setTesting(true);
    try { toast.success((await testExternalModelConnection()).message); }
    catch { toast.error('连通性校验失败，请核对 API 地址、模型名和 API Key'); }
    finally { setTesting(false); }
  };

  if (!settings || !form) {
    return <main className={embedded ? 'p-3 text-sm text-black/50' : 'min-h-screen bg-[#f7f7f5] p-8 text-sm text-black/50'}><LoaderCircle className="mr-2 inline size-4 animate-spin" />正在读取模型配置…</main>;
  }

  return <main className={embedded ? 'text-[#161616]' : 'min-h-screen bg-[#f7f7f5] px-5 py-7 text-[#161616] md:px-10 md:py-10'}><div className={embedded ? '' : 'mx-auto max-w-2xl'}>{!embedded && <header className="flex items-center justify-between border-b border-black/8 pb-5"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#7c3aed] text-white"><CloudCog className="size-5" /></div><div><p className="text-sm font-semibold">外部大模型总结</p><p className="text-xs text-black/45">DeepSeek 与 OpenAI 兼容接口</p></div></div><Button asChild size="sm" variant="outline"><Link to="/"><ArrowLeft className="size-4" />返回入口</Link></Button></header>}<section className={`${embedded ? 'pt-2' : 'mt-8'} space-y-6`}><div className="flex items-center justify-between rounded-xl border border-black/8 bg-white p-5"><div><p className="font-medium">使用外部模型生成笔记</p><p className="mt-1 text-xs leading-5 text-black/50">启用后，转录稿和文档原文会发送给该模型生成初稿；真实性审核仍由现有流程完成。</p></div><Switch checked={form.enabled} disabled={!editing} onCheckedChange={(enabled: boolean): void => update({ enabled })} /></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">外部模型会接收待总结的原文。不要用于含未经授权的个人信息、机密或受限制资料。API Key 只保存在本机受限配置文件，不会回传页面或写入日志。</div><div className="grid gap-5 rounded-xl border border-black/8 bg-white p-5"><div className="grid gap-2"><Label htmlFor="model-url">API 地址</Label><Input disabled={!editing} id="model-url" onChange={(event) => update({ baseUrl: event.target.value })} placeholder="https://api.deepseek.com/v1" value={form.baseUrl} /><p className="text-xs text-black/45">使用 OpenAI 兼容的 Chat Completions 地址，填写到 /v1 即可。</p></div><div className="grid gap-2"><Label htmlFor="model-name">模型名</Label><Input disabled={!editing} id="model-name" onChange={(event) => update({ model: event.target.value })} placeholder="deepseek-chat" value={form.model} /></div><div className="grid gap-2"><Label htmlFor="model-key">API Key</Label><Input disabled={!editing} id="model-key" onChange={(event) => update({ apiKey: event.target.value })} placeholder={settings.apiKeyConfigured ? '已保存；留空则不变' : '请输入 API Key'} type="password" value={form.apiKey} /></div></div><div className="flex flex-wrap items-center gap-3">{editing ? <><Button className="h-11" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{saving ? '正在保存' : '保存配置'}</Button>{settings.configured && <Button className="h-11" disabled={saving} onClick={() => { setForm(toFormState(settings)); setEditing(false); }} variant="outline">取消修改</Button>}</> : <><Button className="h-11" disabled={testing} onClick={() => void test()} variant="outline">{testing ? <LoaderCircle className="size-4 animate-spin" /> : <CloudCog className="size-4" />}测试连通性</Button><Button className="h-11" onClick={() => setEditing(true)}>修改配置</Button></>}</div></section></div></main>;
}
