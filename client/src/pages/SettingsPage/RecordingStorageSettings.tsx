import { useEffect, useState } from 'react';
import { HardDrive, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  getRecordingStorageSettings,
  updateRecordingStorageSettings,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { RecordingStorageSettings } from '@shared/api.interface';

export default function RecordingStorageSettings() {
  const [settings, setSettings] = useState<RecordingStorageSettings | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void getRecordingStorageSettings()
      .then(setSettings)
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : '录音存储配置加载失败',
        ),
      );
  }, []);
  if (!settings)
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-black/45">
        加载中...
      </div>
    );
  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      setSettings(
        await updateRecordingStorageSettings({
          autoArchive: settings.autoArchive,
          archivePath: settings.archivePath,
          checkDiskSpace: settings.checkDiskSpace,
        }),
      );
      toast.success('录音存储配置已保存');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
          <HardDrive className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">录音存储</h2>
          <p className="mt-1 text-sm text-black/50">
            配置录音结束后是否复制到电脑本地目录。
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-5">
        <div>
          <label
            className="text-sm font-medium"
            htmlFor="settings-archive-path"
          >
            本地归档目录
          </label>
          <Input
            className="mt-2"
            id="settings-archive-path"
            onChange={(event) =>
              setSettings({ ...settings, archivePath: event.target.value })
            }
            value={settings.archivePath}
          />
          <p className="mt-1 text-xs text-black/45">
            必须是当前电脑可访问的绝对路径。
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">录音完成后自动归档</p>
            <p className="mt-1 text-xs text-black/45">
              保留应用内副本，归档失败可重试。
            </p>
          </div>
          <Switch
            checked={settings.autoArchive}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, autoArchive: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">归档前检查磁盘空间</p>
            <p className="mt-1 text-xs text-black/45">
              空间不足时只保存应用内副本。
            </p>
          </div>
          <Switch
            checked={settings.checkDiskSpace}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, checkDiskSpace: checked })
            }
          />
        </div>
      </div>
      <Button className="mt-6" disabled={saving} onClick={() => void save()}>
        <LoaderCircle
          className={`size-4 ${saving ? 'animate-spin' : 'hidden'}`}
        />
        保存录音存储设置
      </Button>
    </div>
  );
}
