import {
  Bell,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type {
  CreateTaskNotificationWebhookRequest,
  TaskNotificationSettings,
  TaskNotificationWebhook,
} from '@shared/api.interface';
import {
  createTaskNotificationWebhook,
  deleteTaskNotificationWebhook,
  getTaskNotificationSettings,
  testSavedTaskNotificationWebhook,
  testTaskNotificationWebhook,
  updateTaskNotificationWebhook,
} from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface TaskNotificationSettingsPageProps {
  embedded?: boolean;
}

interface FormState {
  enabled: boolean;
  id?: string;
  name: string;
  secret: string;
  url: string;
}

const EMPTY_FORM: FormState = {
  enabled: true,
  name: '',
  secret: '',
  url: '',
};

function toEditForm(item: TaskNotificationWebhook): FormState {
  return {
    enabled: item.enabled,
    id: item.id,
    name: item.name,
    secret: '',
    url: '',
  };
}

export default function TaskNotificationSettingsPage({
  embedded = false,
}: TaskNotificationSettingsPageProps) {
  const [settings, setSettings] = useState<TaskNotificationSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingForm, setTestingForm] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<TaskNotificationWebhook | null>(null);

  const load = async (): Promise<void> => {
    try {
      setSettings(await getTaskNotificationSettings());
    } catch {
      toast.error('无法读取通知配置');
    }
  };

  useEffect((): void => {
    void load();
  }, []);

  const updateForm = (patch: Partial<FormState>): void => {
    setForm((current: FormState | null): FormState | null =>
      current ? { ...current, ...patch } : current,
    );
  };

  const save = async (): Promise<void> => {
    if (!form) return;
    setSaving(true);
    try {
      const input: CreateTaskNotificationWebhookRequest = {
        enabled: form.enabled,
        name: form.name,
        secret: form.secret,
        url: form.url,
      };
      const next: TaskNotificationSettings = form.id
        ? await updateTaskNotificationWebhook(form.id, input)
        : await createTaskNotificationWebhook(input);
      setSettings(next);
      setForm(null);
      toast.success(form.id ? '飞书机器人配置已更新' : '飞书机器人已添加');
    } catch {
      toast.error('保存失败，请核对名称、地址和签名密钥');
    } finally {
      setSaving(false);
    }
  };

  const testForm = async (): Promise<void> => {
    if (!form || !form.name.trim() || !form.url.trim()) {
      toast.error('请先填写名称和 Webhook 地址');
      return;
    }
    setTestingForm(true);
    try {
      const result = await testTaskNotificationWebhook({
        enabled: form.enabled,
        name: form.name,
        secret: form.secret,
        url: form.url,
      });
      toast.success(result.message);
    } catch {
      toast.error('飞书机器人连通性校验失败');
    } finally {
      setTestingForm(false);
    }
  };

  const testSaved = async (item: TaskNotificationWebhook): Promise<void> => {
    setTestingId(item.id);
    try {
      const result = await testSavedTaskNotificationWebhook(item.id);
      toast.success(result.message);
      await load();
    } catch {
      toast.error('飞书机器人连通性校验失败');
      await load();
    } finally {
      setTestingId(null);
    }
  };

  const toggle = async (item: TaskNotificationWebhook, enabled: boolean): Promise<void> => {
    try {
      const next: TaskNotificationSettings = await updateTaskNotificationWebhook(item.id, {
        enabled,
        name: item.name,
        secret: '',
        url: '',
      });
      setSettings(next);
      toast.success(enabled ? `${item.name} 已启用` : `${item.name} 已停用`);
    } catch {
      toast.error('更新通知状态失败');
    }
  };

  const remove = async (item: TaskNotificationWebhook): Promise<void> => {
    try {
      setSettings(await deleteTaskNotificationWebhook(item.id));
      if (form?.id === item.id) setForm(null);
      setDeleteCandidate(null);
      toast.success('飞书机器人已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  if (!settings) {
    return (
      <main className={embedded ? 'p-3 text-sm text-black/50' : 'min-h-screen bg-[#f7f7f5] p-8 text-sm text-black/50'}>
        <LoaderCircle className="mr-2 inline size-4 animate-spin" />正在读取通知配置…
      </main>
    );
  }

  return (
    <main className={embedded ? 'text-[#161616]' : 'min-h-screen bg-[#f7f7f5] px-5 py-7 text-[#161616] md:px-10 md:py-10'}>
      <div className={embedded ? '' : 'mx-auto max-w-3xl'}>
        {!embedded && (
          <header className="flex items-center gap-3 border-b border-black/8 pb-5">
            <div className="grid size-10 place-items-center rounded-xl bg-[#0f766e] text-white">
              <Bell className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">任务结果通知</p>
              <p className="text-xs text-black/45">通过飞书机器人接收所有任务的最终结果</p>
            </div>
          </header>
        )}

        <section className={`${embedded ? 'pt-2' : 'mt-8'} space-y-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">飞书机器人</p>
              <p className="mt-1 text-xs leading-5 text-black/50">
                任务完成、失败或取消后，会向所有启用的机器人发送通知。
              </p>
            </div>
            <Button onClick={(): void => setForm({ ...EMPTY_FORM })}>
              <Plus className="size-4" />新增机器人
            </Button>
          </div>

          {form && (
            <div className="grid gap-5 rounded-xl border border-black/8 bg-white p-5">
              <div className="flex items-center justify-between border-b border-black/8 pb-3">
                <p className="font-medium">{form.id ? '编辑飞书机器人' : '新增飞书机器人'}</p>
                <Button aria-label="关闭编辑" onClick={(): void => setForm(null)} size="icon" variant="ghost">
                  <X className="size-4" />
                </Button>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notification-name">名称</Label>
                <Input id="notification-name" onChange={(event): void => updateForm({ name: event.target.value })} placeholder="例如：项目通知群" value={form.name} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notification-url">飞书机器人 Webhook 地址</Label>
                <Input id="notification-url" onChange={(event): void => updateForm({ url: event.target.value })} placeholder={form.id ? '已保存；留空则不变' : 'https://open.feishu.cn/open-apis/bot/v2/hook/…'} type="url" value={form.url} />
                {form.id && <p className="text-xs text-black/45">当前地址：保存配置后仅展示脱敏地址。</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notification-secret">签名密钥（可选）</Label>
                <Input id="notification-secret" onChange={(event): void => updateForm({ secret: event.target.value })} placeholder={form.id ? '已保存；留空则不变' : '如机器人开启了签名校验，请填写 Secret'} type="password" value={form.secret} />
              </div>
              <div className="flex items-center justify-between border-t border-black/8 pt-4">
                <div><p className="text-sm font-medium">启用通知</p><p className="text-xs text-black/45">停用后不会发送任务结果。</p></div>
                <Switch checked={form.enabled} onCheckedChange={(enabled: boolean): void => updateForm({ enabled })} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button disabled={saving} onClick={(): void => void save()}>
                  {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}保存配置
                </Button>
                <Button disabled={testingForm} onClick={(): void => void testForm()} variant="outline">
                  {testingForm ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}测试连通性
                </Button>
              </div>
              <p className="text-xs leading-5 text-black/45">Webhook 地址和签名密钥仅保存在服务端受限配置文件中，不会写入日志。</p>
            </div>
          )}

          {settings.items.length === 0 && !form && (
            <div className="rounded-xl border border-dashed border-black/15 bg-white/70 p-10 text-center text-sm text-black/50">
              <Bell className="mx-auto mb-3 size-6" />尚未配置飞书机器人
            </div>
          )}

          <div className="grid gap-3">
            {settings.items.map((item: TaskNotificationWebhook) => (
              <div className="grid gap-4 rounded-xl border border-black/8 bg-white p-5 md:grid-cols-[1fr_auto] md:items-center" key={item.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${item.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-black/8 text-black/45'}`}>
                      {item.enabled ? '已启用' : '已停用'}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs text-black/50">{item.url}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-black/45">
                    {item.secretConfigured && <span>已配置签名密钥</span>}
                    {item.lastTestStatus === 'success' && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-3.5" />最近测试成功</span>}
                    {item.lastTestStatus === 'failed' && <span className="inline-flex items-center gap-1 text-red-700"><CircleAlert className="size-3.5" />最近测试失败</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Switch aria-label={`${item.name} 通知开关`} checked={item.enabled} onCheckedChange={(enabled: boolean): void => void toggle(item, enabled)} />
                  <Button aria-label={`测试 ${item.name}`} disabled={testingId === item.id} onClick={(): void => void testSaved(item)} size="icon" variant="outline">
                    {testingId === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                  <Button aria-label={`编辑 ${item.name}`} onClick={(): void => setForm(toEditForm(item))} size="icon" variant="outline"><Pencil className="size-4" /></Button>
                  <Button aria-label={`删除 ${item.name}`} onClick={(): void => setDeleteCandidate(item)} size="icon" variant="outline"><Trash2 className="size-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <Dialog open={Boolean(deleteCandidate)} onOpenChange={(open: boolean): void => { if (!open) setDeleteCandidate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除飞书机器人</DialogTitle>
            <DialogDescription>
              确定删除“{deleteCandidate?.name}”吗？删除后将停止向该地址发送任务结果通知。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={(): void => setDeleteCandidate(null)} variant="outline">取消</Button>
            <Button disabled={!deleteCandidate} onClick={(): void => { if (deleteCandidate) void remove(deleteCandidate); }} variant="destructive">
              <Trash2 className="size-4" />确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
