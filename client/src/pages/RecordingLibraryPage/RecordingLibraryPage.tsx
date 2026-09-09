import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Download,
  FileAudio,
  FolderCog,
  HardDrive,
  LoaderCircle,
  Mic2,
  Pencil,
  Play,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { resolveAppUrl } from '@lark-apaas/client-toolkit/utils/resolveAppUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  archiveRecordingAsset,
  createNoteJob,
  getNoteJob,
  getRecordingAsset,
  getRecordingAssets,
  getRecordingStorageSettings,
  requestPlayableRecording,
  repairLegacyRecordingArchives,
  updateRecordingAsset,
  updateRecordingStorageSettings,
} from '@/api';
import type {
  RecordingAsset,
  RecordingAssetProcessingStatus,
  RecordingPlayableStatus,
  RecordingAssetStorageStatus,
  RecordingStorageSettings,
} from '@shared/api.interface';

const processingLabels: Record<RecordingAssetProcessingStatus, string> = {
  unprocessed: '未处理',
  processing: '处理中',
  processed: '已生成笔记',
  failed: '处理失败',
};
const storageLabels: Record<RecordingAssetStorageStatus, string> = {
  app_only: '应用内保存',
  pending_archive: '待归档',
  archived: '已归档',
  archive_failed: '归档失败',
};
const playableLabels: Record<RecordingPlayableStatus, string> = {
  pending: '等待通用 M4A',
  converting: '正在准备 M4A',
  ready: 'M4A 可播放',
  failed: 'M4A 生成失败',
};

function formatDuration(durationMs: number | null): string {
  if (!durationMs) return '--:--';
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function resolvePlayableUrl(asset: RecordingAsset): string {
  return asset.playableUrl
    ? resolveAppUrl(asset.playableUrl)
    : asset.media.downloadUrl;
}

export default function RecordingLibraryPage() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<RecordingAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [processingFilter, setProcessingFilter] = useState('all');
  const [storageFilter, setStorageFilter] = useState('all');
  const [settings, setSettings] = useState<RecordingStorageSettings>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [draftSettings, setDraftSettings] =
    useState<RecordingStorageSettings>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    try {
      const [assetResponse, storageSettings] = await Promise.all([
        getRecordingAssets(),
        getRecordingStorageSettings(),
      ]);
      setAssets(assetResponse.items);
      setSettings(storageSettings);
      setDraftSettings(storageSettings);
      setSelectedId((current) =>
        current && assetResponse.items.some((item) => item.id === current)
          ? current
          : assetResponse.items[0]?.id,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '录音记录加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const processing = assets.filter(
      (item) =>
        item.processingStatus === 'processing' && item.linkedJobIds?.length,
    );
    if (processing.length === 0) return undefined;
    const timer = window.setInterval(() => {
      void Promise.all(
        processing.map(async (item) => {
          const jobId = item.linkedJobIds?.[item.linkedJobIds.length - 1];
          if (!jobId) return;
          const job = await getNoteJob(jobId).catch(() => undefined);
          if (!job || !['completed', 'failed'].includes(job.stage)) return;
          const nextStatus: RecordingAssetProcessingStatus =
            job.stage === 'completed' ? 'processed' : 'failed';
          const response = await updateRecordingAsset(item.id, {
            processingStatus: nextStatus,
          });
          setAssets((current) =>
            current.map((candidate) =>
              candidate.id === response.item.id ? response.item : candidate,
            ),
          );
        }),
      );
    }, 4000);
    return () => window.clearInterval(timer);
  }, [assets]);

  const visibleAssets = useMemo(
    () =>
      assets.filter((asset) => {
        const text = `${asset.title} ${asset.fileName}`.toLowerCase();
        return (
          (!keyword.trim() || text.includes(keyword.trim().toLowerCase())) &&
          (processingFilter === 'all' ||
            asset.processingStatus === processingFilter) &&
          (storageFilter === 'all' || asset.storageStatus === storageFilter)
        );
      }),
    [assets, keyword, processingFilter, storageFilter],
  );
  const selected =
    assets.find((item) => item.id === selectedId) || visibleAssets[0];
  const pendingCount = assets.filter(
    (item) => item.processingStatus === 'unprocessed',
  ).length;
  const legacyBinCount = assets.filter((item) =>
    Boolean(item.archivePath && /\.bin$/iu.test(item.archivePath)),
  ).length;

  useEffect(() => {
    if (
      !selected ||
      !['pending', 'converting'].includes(selected.playableStatus || 'pending')
    ) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void getRecordingAsset(selected.id)
        .then((response) => {
          setAssets((current) =>
            current.map((item) =>
              item.id === response.item.id ? response.item : item,
            ),
          );
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [selected?.id, selected?.playableStatus]);

  const updateSelected = async (input: {
    title?: string;
    processingStatus?: RecordingAssetProcessingStatus;
  }): Promise<RecordingAsset | undefined> => {
    if (!selected) return undefined;
    const response = await updateRecordingAsset(selected.id, input);
    setAssets((items) =>
      items.map((item) =>
        item.id === response.item.id ? response.item : item,
      ),
    );
    return response.item;
  };
  const archiveSelected = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await archiveRecordingAsset(selected.id);
      setAssets((items) =>
        items.map((item) =>
          item.id === response.item.id ? response.item : item,
        ),
      );
      if (response.archived) {
        toast.success(response.message);
      } else {
        toast.warning(response.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '归档失败');
    } finally {
      setBusy(false);
    }
  };
  const requestPlayable = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await requestPlayableRecording(selected.id);
      setAssets((items) =>
        items.map((item) =>
          item.id === response.item.id ? response.item : item,
        ),
      );
      toast.success('正在后台准备通用 M4A，原始录音可继续播放');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'M4A 生成请求失败');
    } finally {
      setBusy(false);
    }
  };
  const repairLegacyArchives = async (): Promise<void> => {
    setBusy(true);
    try {
      const response = await repairLegacyRecordingArchives();
      if (response.queued === 0) {
        toast.message('没有需要修复的历史归档文件');
        return;
      }
      toast.success(`已开始修复 ${response.queued} 条历史录音`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '历史录音修复启动失败');
    } finally {
      setBusy(false);
    }
  };
  const processSelected = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateSelected({ processingStatus: 'processing' });
      const job = await createNoteJob({
        sourceType: 'audio',
        noteStyle: 'meeting',
        mediaItems: [selected.media],
        visualOptions: { mode: 'disabled' },
      });
      await updateSelected({
        processingStatus: job.stage === 'failed' ? 'failed' : 'processing',
      });
      toast.success(
        job.stage === 'failed' ? '处理失败，录音仍可重试' : '已创建转写任务',
      );
      navigate(`/conversion-history?jobId=${job.id}`);
    } catch (error) {
      await updateSelected({ processingStatus: 'failed' }).catch(
        () => undefined,
      );
      toast.error(error instanceof Error ? error.message : '处理失败');
    } finally {
      setBusy(false);
    }
  };
  const saveSettings = async (): Promise<void> => {
    if (!draftSettings) return;
    setBusy(true);
    try {
      const next = await updateRecordingStorageSettings({
        autoArchive: draftSettings.autoArchive,
        archivePath: draftSettings.archivePath,
        checkDiskSpace: draftSettings.checkDiskSpace,
      });
      setSettings(next);
      setDraftSettings(next);
      setSettingsOpen(false);
      toast.success('录音存储设置已保存');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设置保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f7f5] text-[#161616]">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <header className="flex h-14 items-center justify-between border-b border-black/8">
          <nav
            aria-label="面包屑"
            className="flex items-center gap-2 text-xs text-black/50"
          >
            <Link to="/">工作台</Link>
            <span>/</span>
            <span className="text-black/80">录音记录</span>
          </nav>
          <div className="flex gap-2">
            <Button
              aria-label="刷新录音记录"
              onClick={() => void refresh()}
              size="icon"
              variant="ghost"
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/">
                <ArrowLeft className="size-4" />
                返回入口
              </Link>
            </Button>
          </div>
        </header>
        <section className="py-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <Archive className="size-3.5" />
                源文件管理
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                录音记录
              </h1>
              <p className="mt-2 text-sm text-black/50">
                录音先保存，什么时候处理由你决定。
              </p>
            </div>
            <div className="flex gap-2">
              {legacyBinCount > 0 && (
                <Button
                  disabled={busy}
                  onClick={() => void repairLegacyArchives()}
                  variant="outline"
                >
                  <FileAudio className="size-4" />
                  修复 {legacyBinCount} 条历史录音
                </Button>
              )}
              <Button onClick={() => setSettingsOpen(true)} variant="outline">
                <FolderCog className="size-4" />
                本地归档设置
              </Button>
              <Button asChild>
                <Link to="/recording-notes">
                  <Mic2 className="size-4" />
                  开始录音
                </Link>
              </Button>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-black/45">全部录音</p>
              <strong className="mt-1 block text-2xl">{assets.length}</strong>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-black/45">未处理</p>
              <strong className="mt-1 block text-2xl text-amber-700">
                {pendingCount}
              </strong>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-black/45">已归档</p>
              <strong className="mt-1 block text-2xl text-emerald-700">
                {
                  assets.filter((item) => item.storageStatus === 'archived')
                    .length
                }
              </strong>
            </div>
          </div>
          {pendingCount > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <span>有 {pendingCount} 条录音尚未处理，源文件已保存。</span>
              <Button
                onClick={() => setProcessingFilter('unprocessed')}
                size="sm"
                variant="outline"
              >
                查看待处理
              </Button>
            </div>
          )}
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.3fr_.7fr]">
            <section className="overflow-hidden rounded-lg border bg-white">
              <div className="flex flex-wrap gap-2 border-b bg-[#fbfcfb] p-3">
                <div className="relative min-w-48 flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-black/35" />
                  <Input
                    aria-label="搜索录音"
                    className="pl-8"
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="搜索标题或文件名"
                    value={keyword}
                  />
                </div>
                <Select
                  onValueChange={setProcessingFilter}
                  value={processingFilter}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="处理状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部处理状态</SelectItem>
                    <SelectItem value="unprocessed">未处理</SelectItem>
                    <SelectItem value="processing">处理中</SelectItem>
                    <SelectItem value="processed">已生成笔记</SelectItem>
                    <SelectItem value="failed">处理失败</SelectItem>
                  </SelectContent>
                </Select>
                <Select onValueChange={setStorageFilter} value={storageFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="保存状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部保存状态</SelectItem>
                    <SelectItem value="app_only">应用内保存</SelectItem>
                    <SelectItem value="pending_archive">待归档</SelectItem>
                    <SelectItem value="archived">已归档</SelectItem>
                    <SelectItem value="archive_failed">归档失败</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {loading ? (
                <div className="p-12 text-center text-sm text-black/45">
                  加载中...
                </div>
              ) : visibleAssets.length === 0 ? (
                <div className="p-12 text-center text-sm text-black/45">
                  暂无符合条件的录音
                </div>
              ) : (
                <div>
                  {visibleAssets.map((asset) => (
                    <button
                      className={`flex w-full items-center gap-3 border-b px-4 py-4 text-left last:border-b-0 hover:bg-black/[.02] ${asset.id === selected?.id ? 'bg-emerald-50/50' : ''}`}
                      key={asset.id}
                      onClick={() => setSelectedId(asset.id)}
                      type="button"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                        <FileAudio className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">
                          {asset.title}
                        </strong>
                        <span className="mt-1 block text-xs text-black/45">
                          {formatDate(asset.capturedAt)} ·{' '}
                          {formatDuration(asset.durationMs)} · {asset.fileName}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="secondary">
                            {processingLabels[asset.processingStatus]}
                          </Badge>
                          <Badge variant="outline">
                            {storageLabels[asset.storageStatus]}
                          </Badge>
                        </span>
                      </span>
                      <Play
                        className="size-4 text-black/35"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/recording-library/${asset.id}`);
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>
            <aside className="flex items-center justify-center rounded-lg border border-dashed bg-white p-6 text-center lg:sticky lg:top-4">
              <div>
                <FileAudio className="mx-auto size-8 text-blue-600" />
                <h2 className="mt-3 font-semibold">选择播放，进入完整播放器</h2>
                <p className="mt-2 text-sm text-black/45">
                  播放、转写、下载和归档操作将在独立页面完成。
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
      <Dialog onOpenChange={setSettingsOpen} open={settingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>本地录音存储</DialogTitle>
            <DialogDescription>
              录音先保存在应用内，再按需复制到电脑目录。
            </DialogDescription>
          </DialogHeader>
          {draftSettings && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium" htmlFor="archive-path">
                  归档目录
                </label>
                <Input
                  id="archive-path"
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      archivePath: event.target.value,
                    })
                  }
                  value={draftSettings.archivePath}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">录音完成后自动归档</p>
                  <p className="mt-1 text-xs text-black/45">
                    归档失败时保留应用内副本
                  </p>
                </div>
                <Switch
                  checked={draftSettings.autoArchive}
                  onCheckedChange={(checked) =>
                    setDraftSettings({ ...draftSettings, autoArchive: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">归档前检查磁盘空间</p>
                </div>
                <Switch
                  checked={draftSettings.checkDiskSpace}
                  onCheckedChange={(checked) =>
                    setDraftSettings({
                      ...draftSettings,
                      checkDiskSpace: checked,
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button disabled={busy} onClick={() => void saveSettings()}>
              保存设置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setRenameOpen} open={renameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名录音</DialogTitle>
            <DialogDescription>
              只修改记录标题，不会改动原始录音文件。
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="录音标题"
            onChange={(event) => setRenameTitle(event.target.value)}
            value={renameTitle}
          />
          <DialogFooter>
            <Button
              onClick={() => {
                setRenameOpen(false);
                void updateSelected({ title: renameTitle })
                  .then(() => toast.success('标题已更新'))
                  .catch((error: unknown) =>
                    toast.error(
                      error instanceof Error ? error.message : '标题更新失败',
                    ),
                  );
              }}
            >
              保存标题
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
