import { ArrowLeft, FileVideo2, LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  MediaCleanupFileItem,
  MediaCleanupInventoryResponse,
} from '@shared/api.interface';

interface MediaCleanupPreviewViewProps {
  inventory: MediaCleanupInventoryResponse | null;
  loading: boolean;
  onBack: () => void;
}

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

export default function MediaCleanupPreviewView({
  inventory,
  loading,
  onBack,
}: MediaCleanupPreviewViewProps) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const files = inventory?.files || [];
  const pageCount = Math.max(1, Math.ceil(files.length / pageSize));
  const visibleFiles = useMemo(
    () => files.slice((page - 1) * pageSize, page * pageSize),
    [files, page],
  );

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/8 pb-4">
        <div>
          <Button onClick={onBack} size="sm" variant="outline">
            <ArrowLeft className="size-3.5" />
            返回媒体清理
          </Button>
          <h2 className="mt-3 text-xl font-semibold">可清理媒体预览</h2>
          <p className="mt-1 text-xs text-black/50">
            查看当前盘点结果和每个媒体文件的清理原因。
          </p>
        </div>
        <div className="rounded-xl bg-black/[0.035] px-3 py-2 text-right text-xs text-black/55">
          <p>可清理 {inventory?.summary.eligibleFiles || 0} 个</p>
          <p className="mt-1">
            预计释放 {formatBytes(inventory?.summary.eligibleBytes || 0)}
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-black/8 bg-white/90 shadow-sm">
        {loading ? (
          <div className="grid min-h-40 place-items-center text-sm text-black/45">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="grid min-h-40 place-items-center px-6 text-center text-sm text-black/45">
            上传目录中没有媒体文件。
          </div>
        ) : (
          <div className="grid gap-3 p-4">
            {visibleFiles.map((file: MediaCleanupFileItem) => (
              <article
                className="rounded-xl border border-black/8 p-4"
                key={file.objectId}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileVideo2 className="size-4 shrink-0 text-black/45" />
                      <p className="break-all text-sm font-semibold">
                        {file.fileName}
                      </p>
                      <Badge
                        variant={file.eligible ? 'destructive' : 'outline'}
                      >
                        {file.eligible ? '可清理' : '受保护'}
                      </Badge>
                      {file.orphan && (
                        <Badge variant="secondary">孤儿文件</Badge>
                      )}
                    </div>
                    <p className="mt-2 break-all font-mono text-[11px] leading-5 text-black/45">
                      {file.absolutePath}
                    </p>
                    <p className="mt-2 text-xs text-black/55">{file.reason}</p>
                  </div>
                  <div className="shrink-0 text-left text-xs text-black/45 lg:text-right">
                    <p className="font-semibold text-black/70">
                      {formatBytes(file.fileSize)}
                    </p>
                    <p className="mt-1">修改：{formatDate(file.modifiedAt)}</p>
                  </div>
                </div>
                {file.relatedNotes.length > 0 && (
                  <div className="mt-3 border-t border-black/6 pt-3">
                    <p className="text-[11px] font-semibold text-black/35">
                      关联笔记
                    </p>
                    <div className="mt-2 grid gap-1.5">
                      {file.relatedNotes.map((note) => (
                        <div
                          className="flex flex-col gap-1 text-xs text-black/55 sm:flex-row sm:items-center sm:justify-between"
                          key={note.jobId}
                        >
                          <span className="min-w-0 truncate">{note.title}</span>
                          <span className="shrink-0">
                            {note.status} ·{' '}
                            {formatDate(note.completedAt || note.startedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {!loading && files.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/8 px-4 py-3">
            <p className="text-xs text-black/45">
              第 {page} / {pageCount} 页，共 {files.length} 个文件
            </p>
            <div className="flex gap-2">
              <Button
                disabled={page <= 1}
                onClick={(): void => setPage((current) => current - 1)}
                size="sm"
                variant="outline"
              >
                上一页
              </Button>
              <Button
                disabled={page >= pageCount}
                onClick={(): void => setPage((current) => current + 1)}
                size="sm"
                variant="outline"
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
