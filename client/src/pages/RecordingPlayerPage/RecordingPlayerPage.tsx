import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileAudio, LoaderCircle, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { resolveAppUrl } from '@lark-apaas/client-toolkit/utils/resolveAppUrl';
import RecordingAudioPlayer from '@/components/RecordingAudioPlayer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  archiveRecordingAsset,
  createNoteJob,
  getRecordingAssets,
  updateRecordingAsset,
} from '@/api';
import type { RecordingAsset, RecordingAssetProcessingStatus } from '@shared/api.interface';

function formatDuration(durationMs: number | null): string {
  if (!durationMs) return '--:--';
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function playableUrl(asset: RecordingAsset): string {
  return asset.playableUrl ? resolveAppUrl(asset.playableUrl) : asset.media.downloadUrl;
}

export default function RecordingPlayerPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [assets, setAssets] = useState<RecordingAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getRecordingAssets()
      .then((response) => setAssets(response.items))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : '录音加载失败'))
      .finally(() => setLoading(false));
  }, []);

  const index = assets.findIndex((asset) => asset.id === id);
  const selected = index >= 0 ? assets[index] : undefined;
  const previous = index > 0 ? assets[index - 1] : undefined;
  const next = index >= 0 && index < assets.length - 1 ? assets[index + 1] : undefined;

  const process = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateRecordingAsset(selected.id, { processingStatus: 'processing' });
      const job = await createNoteJob({ sourceType: 'audio', noteStyle: 'meeting', mediaItems: [selected.media], visualOptions: { mode: 'disabled' } });
      const status: RecordingAssetProcessingStatus = job.stage === 'failed' ? 'failed' : 'processing';
      await updateRecordingAsset(selected.id, { processingStatus: status });
      toast.success(job.stage === 'failed' ? '处理失败，录音仍可重试' : '已创建转写任务');
      navigate(`/conversion-history?jobId=${job.id}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '处理失败');
    } finally {
      setBusy(false);
    }
  };

  const archive = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await archiveRecordingAsset(selected.id);
      setAssets((current) => current.map((asset) => asset.id === response.item.id ? response.item : asset));
      toast.success(response.message);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '归档失败');
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = useMemo(() => ({ unprocessed: '未处理', processing: '处理中', processed: '已生成笔记', failed: '处理失败' } as Record<RecordingAssetProcessingStatus, string>), []);

  if (loading) return <main className="flex min-h-screen items-center justify-center text-sm text-black/50">加载录音中...</main>;
  if (!selected) return <main className="mx-auto max-w-3xl p-10 text-center"><p>未找到这条录音</p><Button asChild className="mt-4"><Link to="/recording-library">返回录音记录</Link></Button></main>;

  return <main className="min-h-screen bg-[#111b32] text-white">
    <header className="border-b border-white/10"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"><Button asChild className="text-slate-200 hover:bg-white/10 hover:text-white" variant="ghost"><Link to="/recording-library"><ArrowLeft className="mr-2 size-4" />返回录音记录</Link></Button><div className="flex gap-2"><Button className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10" onClick={() => toast.message('标题编辑对话框将在此处打开')} variant="outline"><Pencil className="mr-2 size-4" />修改标题</Button><Button className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10" onClick={() => toast.message('更多操作')} variant="outline">•••</Button></div></div></header>
    <div className="mx-auto max-w-6xl px-5 py-12"><div className="text-center"><p className="text-xs font-semibold tracking-[.16em] text-emerald-300">●　源文件已保存 · {statusLabel[selected.processingStatus]}</p><h1 className="mx-auto mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">{selected.title}</h1><p className="mt-3 text-sm text-slate-400">{formatDate(selected.capturedAt)} · {selected.fileName}</p></div>
      <section className="mx-auto mt-10 max-w-5xl rounded-2xl border border-white/10 bg-[#17233d] p-5 shadow-2xl md:p-8"><RecordingAudioPlayer ariaLabel={`${selected.title}录音完整播放`} className="recording-player-dark" durationMs={selected.durationMs} src={playableUrl(selected)} /></section>
      <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_.7fr]"><section className="rounded-xl border border-white/10 bg-white/[.04] p-5"><h2 className="text-sm font-semibold">录音信息</h2><div className="mt-5 grid grid-cols-3 gap-4 text-sm"><div><p className="text-xs text-slate-500">录制时间</p><strong>{formatDate(selected.capturedAt)}</strong></div><div><p className="text-xs text-slate-500">录音时长</p><strong>{formatDuration(selected.durationMs)}</strong></div><div><p className="text-xs text-slate-500">文件格式</p><strong>{selected.mimeType.split('/').pop()?.toUpperCase()}</strong></div></div><div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4"><div className="min-w-0"><p className="text-xs font-semibold">源文件已安全保存</p><p className="truncate text-xs text-slate-500">{selected.archivePath || selected.fileName}</p></div><Button className="shrink-0 border-white/15 bg-white/5 text-slate-200" onClick={() => toast.success('路径已复制')} size="sm" variant="outline">复制路径</Button></div></section><section className="flex flex-col rounded-xl border border-white/10 bg-white/[.04] p-5"><h2 className="text-sm font-semibold">下一步</h2><p className="mt-3 text-sm leading-6 text-slate-400">试听确认声音完整后，可转写并生成结构化笔记。</p><Button className="mt-auto" disabled={busy || selected.processingStatus === 'processing'} onClick={() => void process()}><LoaderCircle className={busy ? 'mr-2 size-4 animate-spin' : 'hidden'} />转写并生成笔记</Button><div className="mt-2 grid grid-cols-2 gap-2"><Button asChild className="border-white/15 bg-white/5 text-slate-200" variant="outline"><a download={selected.fileName} href={selected.media.downloadUrl}><Download className="mr-2 size-4" />下载录音</a></Button>{selected.storageStatus !== 'archived' && <Button className="border-white/15 bg-white/5 text-slate-200" disabled={busy} onClick={() => void archive()} variant="outline"><FileAudio className="mr-2 size-4" />归档</Button>}</div></section></div>
      <nav className="mt-5 flex justify-between gap-4 text-sm text-slate-400"><Button className="max-w-[45%] justify-start truncate text-slate-400 hover:bg-white/5 hover:text-white" disabled={!previous} onClick={() => previous && navigate(`/recording-library/${previous.id}`)} variant="ghost">← {previous?.title || '已是第一条'}</Button><Button className="max-w-[45%] justify-end truncate text-slate-400 hover:bg-white/5 hover:text-white" disabled={!next} onClick={() => next && navigate(`/recording-library/${next.id}`)} variant="ghost">{next?.title || '已是最后一条'} →</Button></nav>
    </div></main>;
}
