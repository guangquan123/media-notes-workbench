import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  FileX2,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  MediaCleanupRunHistoryItem,
  MediaCleanupRunSource,
  MediaCleanupRunStatus,
} from '@shared/api.interface';

interface MediaCleanupHistoryViewProps {
  items: MediaCleanupRunHistoryItem[];
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
}

type SourceFilter = 'all' | MediaCleanupRunSource;
type StatusFilter = 'all' | MediaCleanupRunStatus;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value: number = bytes / 1024;
  let unit: string = units[0];
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

function sourceLabel(source: MediaCleanupRunSource): string {
  return source === 'manual' ? '手工执行' : '定时任务';
}

function statusLabel(status: MediaCleanupRunStatus): string {
  if (status === 'success') return '已完成';
  if (status === 'partial') return '部分完成';
  return '失败';
}

function statusBadgeClass(status: MediaCleanupRunStatus): string {
  if (status === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (status === 'partial') {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }
  return 'border-red-200 bg-red-50 text-red-800';
}

export default function MediaCleanupHistoryView({
  items,
  loading,
  onBack,
  onRefresh,
}: MediaCleanupHistoryViewProps) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<MediaCleanupRunHistoryItem | null>(
    null,
  );

  const visibleItems: MediaCleanupRunHistoryItem[] = useMemo(
    () =>
      items.filter((item: MediaCleanupRunHistoryItem): boolean => {
        const sourceMatches: boolean =
          sourceFilter === 'all' || item.source === sourceFilter;
        const statusMatches: boolean =
          statusFilter === 'all' || item.status === statusFilter;
        return sourceMatches && statusMatches;
      }),
    [items, sourceFilter, statusFilter],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 border-b border-black/8 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button onClick={onBack} size="sm" variant="outline">
            <ArrowLeft className="size-3.5" />
            返回媒体清理
          </Button>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">执行历史</h2>
            <p className="mt-1 text-xs leading-5 text-black/50">
              查看每次定时或手工清理的执行结果、时间和文件明细。
            </p>
          </div>
        </div>
        <Button
          disabled={loading}
          onClick={onRefresh}
          size="sm"
          variant="outline"
        >
          {loading ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          刷新记录
        </Button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-black/8 bg-white/90 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-black/8 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">媒体清理执行记录</p>
            <p className="mt-1 text-xs text-black/45">
              共 {items.length} 次执行，按完成时间倒序排列。
            </p>
          </div>
          <div className="flex gap-2">
            <Select
              onValueChange={(value: SourceFilter): void =>
                setSourceFilter(value)
              }
              value={sourceFilter}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="scheduled">定时任务</SelectItem>
                <SelectItem value="manual">手工执行</SelectItem>
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value: StatusFilter): void =>
                setStatusFilter(value)
              }
              value={statusFilter}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部结果</SelectItem>
                <SelectItem value="success">已完成</SelectItem>
                <SelectItem value="partial">部分完成</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="grid min-h-40 place-items-center text-sm text-black/45">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="grid min-h-40 place-items-center px-6 text-center text-sm text-black/45">
            暂无符合筛选条件的执行记录。
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-black/[0.025] hover:bg-black/[0.025]">
                <TableHead className="px-4 text-xs">执行时间</TableHead>
                <TableHead className="text-xs">来源</TableHead>
                <TableHead className="text-xs">结果</TableHead>
                <TableHead className="text-xs">删除文件</TableHead>
                <TableHead className="text-xs">释放空间</TableHead>
                <TableHead className="px-4 text-right text-xs">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map((item: MediaCleanupRunHistoryItem) => (
                <TableRow key={item.id}>
                  <TableCell className="px-4 text-xs">
                    {formatDate(item.finishedAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {sourceLabel(item.source)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={statusBadgeClass(item.status)}
                      variant="outline"
                    >
                      {statusLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.deletedFiles} 个
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatBytes(item.deletedBytes)}
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <Button
                      onClick={(): void => setSelected(item)}
                      size="sm"
                      variant="ghost"
                    >
                      查看详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Dialog
        onOpenChange={(open: boolean): void => {
          if (!open) setSelected(null);
        }}
        open={selected !== null}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>清理执行详情</DialogTitle>
                <DialogDescription>
                  {sourceLabel(selected.source)} ·{' '}
                  {formatDate(selected.startedAt)}
                  {' 至 '}
                  {formatDate(selected.finishedAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-black/[0.035] p-3">
                  <p className="text-xs text-black/45">执行结果</p>
                  <p className="mt-1 text-sm font-semibold">
                    {statusLabel(selected.status)}
                  </p>
                </div>
                <div className="rounded-xl bg-black/[0.035] p-3">
                  <p className="text-xs text-black/45">删除文件</p>
                  <p className="mt-1 text-sm font-semibold">
                    {selected.deletedFiles} 个
                  </p>
                </div>
                <div className="rounded-xl bg-black/[0.035] p-3">
                  <p className="text-xs text-black/45">释放空间</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatBytes(selected.deletedBytes)}
                  </p>
                </div>
                <div className="rounded-xl bg-black/[0.035] p-3">
                  <p className="text-xs text-black/45">执行耗时</p>
                  <p className="mt-1 text-sm font-semibold">
                    {Math.max(0, selected.durationMs)} ms
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <HistoryGroup
                  emptyText="本次没有删除文件。"
                  icon={CheckCircle2}
                  items={selected.deletedItems.map((item) => ({
                    detail: formatBytes(item.fileSize),
                    id: item.objectId,
                    label: item.fileName,
                  }))}
                  title="已删除文件"
                />
                <HistoryGroup
                  emptyText="本次没有失败文件。"
                  icon={CircleAlert}
                  items={selected.failed.map((item) => ({
                    detail: item.message,
                    id: item.objectId,
                    label: item.objectId,
                  }))}
                  title="失败文件"
                />
                <HistoryGroup
                  emptyText="本次没有跳过文件。"
                  icon={FileX2}
                  items={selected.skipped.map((item) => ({
                    detail: item.message,
                    id: item.objectId,
                    label: item.objectId,
                  }))}
                  title="跳过文件"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface HistoryGroupItem {
  detail: string;
  id: string;
  label: string;
}

interface HistoryGroupProps {
  emptyText: string;
  icon: LucideIcon;
  items: HistoryGroupItem[];
  title: string;
}

function HistoryGroup({
  emptyText,
  icon: Icon,
  items,
  title,
}: HistoryGroupProps) {
  return (
    <section>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4" />
        {title}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-black/10 p-3 text-xs text-black/40">
          {emptyText}
        </p>
      ) : (
        <div className="mt-2 grid gap-2">
          {items.map((item: HistoryGroupItem) => (
            <div className="rounded-lg border border-black/8 p-3" key={item.id}>
              <p className="break-all text-xs font-semibold">{item.label}</p>
              <p className="mt-1 break-all text-xs text-black/45">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
