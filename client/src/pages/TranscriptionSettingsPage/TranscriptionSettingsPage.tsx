import { ArrowLeft, CheckCircle2, CloudCog, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { TencentAsrSettings } from '@shared/api.interface';
import {
  getTencentAsrSettings,
  testTencentAsrConnection,
  updateTencentAsrSettings,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface FormState {
  asrRegion: string;
  bucket: string;
  enabled: boolean;
  engineModelType: string;
  region: string;
  secretId: string;
  secretKey: string;
  speakerDiarization: boolean;
}

function toFormState(settings: TencentAsrSettings): FormState {
  return {
    asrRegion: settings.asrRegion,
    bucket: settings.bucket,
    enabled: settings.enabled,
    engineModelType: settings.engineModelType,
    region: settings.region,
    secretId: settings.secretId === '已配置' || settings.secretId.includes('••••') ? '' : settings.secretId,
    secretKey: '',
    speakerDiarization: settings.speakerDiarization,
  };
}

export default function TranscriptionSettingsPage() {
  const [settings, setSettings] = useState<TencentAsrSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect((): void => {
    void getTencentAsrSettings()
      .then((next: TencentAsrSettings): void => {
        setSettings(next);
        setForm(toFormState(next));
        setEditing(!next.configured);
      })
      .catch((): void => {
        toast.error('无法读取腾讯云转录配置');
      });
  }, []);

  const update = (patch: Partial<FormState>): void => {
    setForm((current: FormState | null): FormState | null =>
      current ? { ...current, ...patch } : current,
    );
  };

  const save = async (): Promise<void> => {
    if (!form) return;
    setSaving(true);
    try {
      const next: TencentAsrSettings = await updateTencentAsrSettings(form);
      setSettings(next);
      setForm(toFormState(next));
      setEditing(false);
      toast.success(next.enabled ? '腾讯云 ASR 已启用' : '腾讯云 ASR 已关闭，已保留配置');
    } catch {
      toast.error('保存失败，请核对腾讯云参数与权限');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = (): void => {
    setForm(toFormState(settings));
    setEditing(false);
  };

  const testConnection = async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await testTencentAsrConnection();
      toast.success(result.message);
    } catch {
      toast.error('连通性校验失败，请核对启用状态、存储桶和 CAM 权限');
    } finally {
      setTesting(false);
    }
  };

  if (!settings || !form) {
    return <main className="min-h-screen bg-[#f7f7f5] p-8 text-sm text-black/50"><LoaderCircle className="mr-2 inline size-4 animate-spin" />正在读取转录引擎配置…</main>;
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-5 py-7 text-[#161616] md:px-10 md:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between border-b border-black/8 pb-5">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#3370ff] text-white"><CloudCog className="size-5" /></div><div><p className="text-sm font-semibold">腾讯云高质量转录</p><p className="text-xs text-black/45">私有 COS + ASR 大模型 2.0</p></div></div>
          <Button asChild size="sm" variant="outline"><Link to="/"><ArrowLeft className="size-4" />返回入口</Link></Button>
        </header>
        <section className="mt-8 space-y-6">
          <div className="flex items-center justify-between rounded-xl border border-black/8 bg-white p-5"><div><p className="font-medium">使用腾讯云 ASR</p><p className="mt-1 text-xs leading-5 text-black/50">开启后，视频和录音都优先使用腾讯云大模型；关闭后使用本地兜底。</p></div><Switch checked={form.enabled} disabled={!editing} onCheckedChange={(enabled: boolean): void => update({ enabled })} /></div>
          {settings.configured && !editing && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-semibold">配置已保存并锁定</p><p className="mt-1 text-xs leading-5">SecretId：{settings.secretId}；SecretKey：已保存；地域：{settings.region}；存储桶：{settings.bucket || '未填写'}。</p></div>}
          <div className="grid gap-5 rounded-xl border border-black/8 bg-white p-5">
            <div className="grid gap-2"><Label htmlFor="secret-id">SecretId</Label><Input disabled={!editing} id="secret-id" onChange={(event) => update({ secretId: event.target.value })} placeholder={settings.secretId || 'AKID…'} value={form.secretId} /><p className="text-xs text-black/45">{settings.secretId ? `当前：${settings.secretId}` : '尚未保存'}</p></div>
            <div className="grid gap-2"><Label htmlFor="secret-key">SecretKey</Label><Input disabled={!editing} id="secret-key" onChange={(event) => update({ secretKey: event.target.value })} placeholder={settings.secretKeyConfigured ? '已保存；留空则不变' : '请输入 SecretKey'} type="password" value={form.secretKey} /></div>
            <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-2"><Label htmlFor="region">COS 地域</Label><Input disabled={!editing} id="region" onChange={(event) => update({ region: event.target.value })} value={form.region} /></label><label className="grid gap-2"><Label htmlFor="bucket">COS 存储桶</Label><Input disabled={!editing} id="bucket" onChange={(event) => update({ bucket: event.target.value })} placeholder="media-notes-asr-125…" value={form.bucket} /></label></div>
            <div className="grid gap-2"><Label htmlFor="asr-region">ASR API 地域</Label><Input disabled={!editing} id="asr-region" onChange={(event) => update({ asrRegion: event.target.value })} value={form.asrRegion} /><p className="text-xs text-black/45">腾讯云语音识别 API 当前仅支持 ap-guangzhou；这不改变 COS 桶的上海地域。</p></div>
            <div className="grid gap-2"><Label htmlFor="engine">识别引擎</Label><Input disabled={!editing} id="engine" onChange={(event) => update({ engineModelType: event.target.value })} value={form.engineModelType} /><p className="text-xs text-black/45">推荐保留 16k_zh_en_2.0；适合中文、英语、方言及嘈杂音频。</p></div>
            <div className="flex items-center justify-between border-t border-black/8 pt-4"><div><p className="text-sm font-medium">说话人分离</p><p className="text-xs text-black/45">多人录音时标记说话人切换。</p></div><Switch checked={form.speakerDiarization} disabled={!editing} onCheckedChange={(speakerDiarization: boolean): void => update({ speakerDiarization })} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">{editing ? <><Button className="h-11" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{saving ? '正在保存' : '保存配置'}</Button>{settings.configured && <Button className="h-11" disabled={saving} onClick={cancelEdit} variant="outline">取消修改</Button>}</> : <><Button className="h-11" disabled={testing} onClick={() => void testConnection()} variant="outline">{testing ? <LoaderCircle className="size-4 animate-spin" /> : <CloudCog className="size-4" />}测试连通性</Button><Button className="h-11" onClick={() => setEditing(true)}>修改配置</Button></>}<p className="text-xs text-black/45">密钥不会返回页面、不会写入日志；仅保存在本机受限配置文件中。</p></div>
        </section>
      </div>
    </main>
  );
}
