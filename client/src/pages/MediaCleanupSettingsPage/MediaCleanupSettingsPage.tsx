import {
  AlertTriangle,
  Clock3,
  FileVideo2,
  History,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  getMediaCleanupFiles,
  getMediaCleanupHistory,
  getMediaCleanupSettings,
  runMediaCleanup,
  updateMediaCleanupSettings,
} from '@/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type {
  MediaCleanupFrequency,
  MediaCleanupInventoryResponse,
  MediaCleanupRunResponse,
  MediaCleanupRunHistoryItem,
  MediaCleanupSettings,
  UpdateMediaCleanupSettingsRequest,
} from '@shared/api.interface';
import MediaCleanupHistoryView from './MediaCleanupHistoryView';
import MediaCleanupPreviewView from './MediaCleanupPreviewView';

const DEFAULT_FORM: UpdateMediaCleanupSettingsRequest = {
  deleteFailedRecords: false,
  deleteOrphanFiles: true,
  enabled: false,
  frequency: 'weekly',
  monthlyDay: 1,
  retentionDays: 30,
  scheduledTime: '03:00',
  weeklyDay: 0,
};

const WEEKDAYS = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function formatDate(value: string | null): string {
  if (!value) return '尚未执行';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后重试。';
}

export default function MediaCleanupSettingsPage() {
  const [form, setForm] =
    useState<UpdateMediaCleanupSettingsRequest>(DEFAULT_FORM);
  const [settings, setSettings] = useState<MediaCleanupSettings | null>(null);
  const [inventory, setInventory] =
    useState<MediaCleanupInventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<
    MediaCleanupRunHistoryItem[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [nextSettings, nextInventory] = await Promise.all([
        getMediaCleanupSettings(),
        getMediaCleanupFiles(),
      ]);
      setSettings(nextSettings);
      setForm({
        deleteFailedRecords: nextSettings.deleteFailedRecords,
        deleteOrphanFiles: nextSettings.deleteOrphanFiles,
        enabled: nextSettings.enabled,
        frequency: nextSettings.frequency,
        monthlyDay: nextSettings.monthlyDay,
        retentionDays: nextSettings.retentionDays,
        scheduledTime: nextSettings.scheduledTime,
        weeklyDay: nextSettings.weeklyDay,
      });
      setInventory(nextInventory);
    } catch (error) {
      toast.error(`读取媒体清理配置失败：${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshHistory = useCallback(async (): Promise<void> => {
    setHistoryLoading(true);
    try {
      const response = await getMediaCleanupHistory();
      setHistoryItems(response.items);
    } catch (error) {
      toast.error(`读取执行历史失败：${errorMessage(error)}`);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistory = (): void => {
    setHistoryOpen(true);
    void refreshHistory();
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const next = await updateMediaCleanupSettings(form);
      setSettings(next);
      toast.success('媒体清理配置已保存');
      await refresh();
      if (historyOpen) await refreshHistory();
    } catch (error) {
      toast.error(`保存失败：${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const run = async (): Promise<void> => {
    setConfirmOpen(false);
    setRunning(true);
    try {
      const result: MediaCleanupRunResponse = await runMediaCleanup();
      if (result.failed.length > 0) {
        toast.error(
          `已删除 ${result.deletedFiles} 个文件，${result.failed.length} 个失败。`,
        );
      } else if (result.skipped.length > 0 && result.deletedFiles === 0) {
        toast.warning(
          `本次未执行删除：${result.skipped[0]?.message || '文件均被跳过。'}`,
        );
      } else if (result.skipped.length > 0) {
        toast.warning(
          `已删除 ${result.deletedFiles} 个文件，${result.skipped.length} 个文件被跳过。`,
        );
      } else {
        toast.success(
          `清理完成：删除 ${result.deletedFiles} 个文件，释放 ${formatBytes(result.deletedBytes)}。`,
        );
      }
      await refresh();
    } catch (error) {
      toast.error(`执行清理失败：${errorMessage(error)}`);
    } finally {
      setRunning(false);
    }
  };

  const eligibleFiles = inventory?.summary.eligibleFiles || 0;
  const eligibleBytes = inventory?.summary.eligibleBytes || 0;

  if (historyOpen) {
    return (
      <MediaCleanupHistoryView
        items={historyItems}
        loading={historyLoading}
        onBack={(): void => setHistoryOpen(false)}
        onRefresh={(): void => void refreshHistory()}
      />
    );
  }

  if (previewOpen) {
    return (
      <MediaCleanupPreviewView
        inventory={inventory}
        loading={loading}
        onBack={(): void => setPreviewOpen(false)}
      />
    );
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-black/8 bg-white/90 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-xl bg-[#111315] text-white">
                <Trash2 className="size-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">媒体文件定时清理</h2>
                <p className="mt-0.5 text-xs text-black/45">
                  只清理达到保留期且未被运行中任务使用的本地媒体。
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={openHistory} size="sm" variant="outline">
              <History className="size-3.5" />
              执行历史
            </Button>
            <Button
              disabled={loading || running}
              onClick={(): void => void refresh()}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={`size-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              刷新盘点
            </Button>
            <Button
              disabled={loading || saving}
              onClick={(): void => void save()}
              size="sm"
            >
              {saving ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              保存配置
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-black/8 p-4 md:col-span-2">
            <div>
              <Label htmlFor="cleanup-enabled">启用定时清理</Label>
              <p className="mt-1 text-xs text-black/45">
                关闭时仍可手工预览和执行清理。
              </p>
            </div>
            <Switch
              checked={form.enabled}
              id="cleanup-enabled"
              onCheckedChange={(enabled: boolean): void =>
                setForm((current) => ({ ...current, enabled }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>执行周期</Label>
            <Select
              onValueChange={(frequency: MediaCleanupFrequency): void =>
                setForm((current) => ({ ...current, frequency }))
              }
              value={form.frequency}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">每天</SelectItem>
                <SelectItem value="weekly">每周</SelectItem>
                <SelectItem value="monthly">每月</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cleanup-time">执行时间</Label>
            <Input
              id="cleanup-time"
              onChange={(event): void =>
                setForm((current) => ({
                  ...current,
                  scheduledTime: event.target.value,
                }))
              }
              type="time"
              value={form.scheduledTime}
            />
          </div>

          {form.frequency === 'weekly' && (
            <div className="grid gap-2">
              <Label>每周执行日</Label>
              <Select
                onValueChange={(value: string): void =>
                  setForm((current) => ({
                    ...current,
                    weeklyDay: Number(value),
                  }))
                }
                value={String(form.weeklyDay)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((label, index) => (
                    <SelectItem key={label} value={String(index)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.frequency === 'monthly' && (
            <div className="grid gap-2">
              <Label htmlFor="cleanup-month-day">每月执行日（1—28）</Label>
              <Input
                id="cleanup-month-day"
                max={28}
                min={1}
                onChange={(event): void =>
                  setForm((current) => ({
                    ...current,
                    monthlyDay: Number(event.target.value),
                  }))
                }
                type="number"
                value={form.monthlyDay}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="cleanup-retention">媒体保留天数</Label>
            <Input
              id="cleanup-retention"
              max={3650}
              min={1}
              onChange={(event): void =>
                setForm((current) => ({
                  ...current,
                  retentionDays: Number(event.target.value),
                }))
              }
              type="number"
              value={form.retentionDays}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-black/8 p-4">
            <div>
              <Label htmlFor="cleanup-orphans">清理孤儿文件</Label>
              <p className="mt-1 text-xs text-black/45">
                没有任何笔记记录引用的文件。
              </p>
            </div>
            <Switch
              checked={form.deleteOrphanFiles}
              id="cleanup-orphans"
              onCheckedChange={(deleteOrphanFiles: boolean): void =>
                setForm((current) => ({ ...current, deleteOrphanFiles }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 p-4 md:col-span-2">
            <div>
              <Label htmlFor="cleanup-failed">清理失败任务媒体</Label>
              <p className="mt-1 text-xs text-amber-800/70">
                开启后，超过保留期且所有关联任务均失败的媒体也会删除。
              </p>
            </div>
            <Switch
              checked={form.deleteFailedRecords}
              id="cleanup-failed"
              onCheckedChange={(deleteFailedRecords: boolean): void =>
                setForm((current) => ({ ...current, deleteFailedRecords }))
              }
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-xl bg-black/[0.035] p-4 text-xs text-black/55 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Clock3 className="size-3.5" />
            下次执行：{formatDate(settings?.nextRunAt || null)}
          </span>
          <span>
            上次执行：{formatDate(settings?.lastRunAt || null)}
            {settings?.lastRunSource
              ? `（${settings.lastRunSource === 'manual' ? '手工' : '定时'}）`
              : ''}
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-black/8 bg-white/90 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">本次清理预览</h2>
            <p className="mt-1 text-xs text-black/45">
              执行前按最新文件状态再次复核，不会删除运行中媒体。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={(): void => setPreviewOpen(true)}
              size="sm"
              variant="outline"
            >
              查看可清理明细
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={loading || running || eligibleFiles === 0}
              onClick={(): void => setConfirmOpen(true)}
            >
              {running ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              手工执行清理
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-black/8 p-4">
            <div className="flex items-center gap-2 text-xs text-black/45">
              <FileVideo2 className="size-3.5" />
              媒体文件
            </div>
            <p className="mt-2 text-lg font-semibold">
              {inventory?.summary.totalFiles || 0} 个
            </p>
          </div>
          <div className="rounded-xl border border-black/8 p-4">
            <div className="flex items-center gap-2 text-xs text-black/45">
              <ShieldCheck className="size-3.5" />
              占用空间
            </div>
            <p className="mt-2 text-lg font-semibold">
              {formatBytes(inventory?.summary.totalBytes || 0)}
            </p>
          </div>
          <div className="rounded-xl border border-black/8 p-4">
            <div className="flex items-center gap-2 text-xs text-black/45">
              <Trash2 className="size-3.5" />
              本次可清理
            </div>
            <p className="mt-2 text-lg font-semibold">{eligibleFiles} 个</p>
          </div>
          <div className="rounded-xl border border-black/8 p-4">
            <div className="flex items-center gap-2 text-xs text-black/45">
              <AlertTriangle className="size-3.5" />
              预计释放
            </div>
            <p className="mt-2 text-lg font-semibold">
              {formatBytes(eligibleBytes)}
            </p>
          </div>
        </div>
      </section>

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除本次可清理媒体？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {eligibleFiles} 个文件，预计释放{' '}
              {formatBytes(eligibleBytes)}
              。生成的笔记和转录文本会保留，但被删除的源媒体无法恢复，也不能再用于完整重跑。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(): void => void run()}
            >
              确认永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
