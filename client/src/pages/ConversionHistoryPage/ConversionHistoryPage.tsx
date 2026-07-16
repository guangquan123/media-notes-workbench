import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileAudio,
  FileText,
  FileVideo,
  History,
  ListChecks,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import {
  downloadRawTranscript,
  getNoteConversionHistory,
  markNoteProcessed,
  markNoteProcessedBatch,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadBlob } from '@/utils/download';
import type {
  NoteConversionHistoryPagination,
  NoteConversionRecord,
  NoteSourceType,
} from '@shared/api.interface';

const PAGE_SIZE = 10;

const SOURCE_STYLES: Record<
  NoteSourceType,
  { accent: string; background: string }
> = {
  platform: { accent: '#fb7299', background: '#fff0f5' },
  video: { accent: '#e86f3d', background: '#fff2eb' },
  audio: { accent: '#168b75', background: '#eaf8f4' },
  pdf: { accent: '#3370ff', background: '#edf3ff' },
  document: { accent: '#3370ff', background: '#edf3ff' },
};

type ProcessingFilter = 'all' | 'pending' | 'processed';

const PROCESSING_FILTERS: Array<{ label: string; value: ProcessingFilter }> = [
  { label: '全部', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '已处理', value: 'processed' },
];

function getStatusCopy(record: NoteConversionRecord): string {
  if (record.status === 'completed') return '已完成';
  if (record.status === 'failed') return '失败';
  return '处理中';
}

function ConversionIcon({ sourceType }: { sourceType: NoteSourceType }) {
  if (sourceType === 'audio') return <FileAudio className="size-5" />;
  if (sourceType === 'pdf' || sourceType === 'document') {
    return <FileText className="size-5" />;
  }
  return <FileVideo className="size-5" />;
}

function isSelectable(record: NoteConversionRecord): boolean {
  return record.status === 'completed' && record.processingStatus === 'pending';
}

export default function ConversionHistoryPage() {
  const [records, setRecords] = useState<NoteConversionRecord[]>([]);
  const [pagination, setPagination] =
    useState<NoteConversionHistoryPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingFilter, setProcessingFilter] =
    useState<ProcessingFilter>('all');
  const [page, setPage] = useState(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [markingJobId, setMarkingJobId] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);

  const loadRecords = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await getNoteConversionHistory({
        page,
        pageSize: PAGE_SIZE,
        processingStatus:
          processingFilter === 'all' ? undefined : processingFilter,
      });
      if (
        response.items.length === 0 &&
        response.pagination.totalPages > 0 &&
        page > response.pagination.totalPages
      ) {
        setPage(response.pagination.totalPages);
        return;
      }
      setRecords(response.items);
      setPagination(response.pagination);
      setSelectedJobIds([]);
    } catch {
      toast.error('转化记录加载失败，请稍后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, [page, processingFilter]);

  const downloadTranscript = async (record: NoteConversionRecord) => {
    try {
      const blob: Blob = await downloadRawTranscript(record.jobId);
      downloadBlob(blob, `原文-${record.jobId}.md`);
      toast.success('原文下载已开始');
    } catch {
      toast.error('原文下载失败，请稍后重试');
    }
  };

  const markProcessed = async (record: NoteConversionRecord) => {
    setMarkingJobId(record.jobId);
    try {
      await markNoteProcessed(record.jobId);
      await loadRecords(true);
      toast.success('已标记处理完成，并同步完成飞书待处理任务');
    } catch {
      toast.error('标记处理失败，请稍后重试');
    } finally {
      setMarkingJobId(null);
    }
  };

  const selectableRecords: NoteConversionRecord[] = records.filter(
    (record: NoteConversionRecord) => isSelectable(record),
  );
  const selectedCount: number = selectedJobIds.length;
  const isAllPageSelected: boolean =
    selectableRecords.length > 0 &&
    selectableRecords.every((record: NoteConversionRecord) =>
      selectedJobIds.includes(record.jobId),
    );

  const togglePageSelection = () => {
    setSelectedJobIds(
      isAllPageSelected
        ? []
        : selectableRecords.map((record: NoteConversionRecord) => record.jobId),
    );
  };

  const toggleRecordSelection = (jobId: string) => {
    setSelectedJobIds((current: string[]) =>
      current.includes(jobId)
        ? current.filter((item: string) => item !== jobId)
        : [...current, jobId],
    );
  };

  const markSelectedProcessed = async () => {
    if (selectedJobIds.length === 0) return;
    setBatchProcessing(true);
    try {
      const result = await markNoteProcessedBatch({ jobIds: selectedJobIds });
      await loadRecords(true);
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} 条记录处理失败，请稍后重试`);
      } else if (result.processedJobIds.length > 0) {
        toast.success(`已处理 ${result.processedJobIds.length} 条记录`);
      } else {
        toast.message('所选记录已处理，无需重复操作');
      }
    } catch {
      toast.error('批量标记失败，请稍后重试');
    } finally {
      setBatchProcessing(false);
    }
  };

  const changeFilter = (filter: ProcessingFilter) => {
    setProcessingFilter(filter);
    setPage(1);
    setSelectedJobIds([]);
  };

  const totalPages: number = pagination?.totalPages || 0;
  const totalItems: number = pagination?.totalItems || 0;

  return (
    <main className="min-h-screen overflow-auto bg-[radial-gradient(circle_at_top_right,_rgba(51,112,255,0.08),_transparent_28%),linear-gradient(180deg,#faf9f6_0%,#f5f4f0_100%)] text-[#161616]">
      <div className="mx-auto min-h-screen max-w-6xl px-5 py-7 md:px-10 md:py-10">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#161616] text-white shadow-sm">
              <History className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">转化记录</p>
              <p className="text-xs text-black/45">回看每一次知识沉淀</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="rounded-full border-black/8 bg-white text-black/62"
              disabled={refreshing}
              onClick={() => void loadRecords(true)}
              variant="outline"
            >
              <RefreshCw
                className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              刷新
            </Button>
            <Button
              asChild
              className="rounded-full border-black/8 bg-white text-black/62"
              variant="outline"
            >
              <Link to="/">
                <ArrowLeft className="size-4" />
                返回入口
              </Link>
            </Button>
          </div>
        </header>

        <section className="py-10">
          <div className="mb-8 flex flex-col gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3370ff]">
                Conversion archive
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] md:text-5xl">
                过去学过什么，
                <br />
                在这里一目了然。
              </h1>
            </div>
            {!loading && totalItems > 0 ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-black/7 bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 text-sm text-black/45">
                    共 {totalItems} 条记录
                  </span>
                  {PROCESSING_FILTERS.map(
                    (filter: { label: string; value: ProcessingFilter }) => (
                      <Button
                        className={
                          processingFilter === filter.value
                            ? 'rounded-full bg-[#161616] text-white hover:bg-[#161616]'
                            : 'rounded-full border-black/8 bg-white text-black/58'
                        }
                        key={filter.value}
                        onClick={() => changeFilter(filter.value)}
                        size="sm"
                        variant="outline"
                      >
                        {filter.label}
                      </Button>
                    ),
                  )}
                </div>
                <Button
                  className={
                    selectionMode
                      ? 'rounded-full bg-[#161616] text-white hover:bg-[#161616]'
                      : 'rounded-full border-black/8 bg-white text-black/62'
                  }
                  onClick={() => {
                    setSelectionMode((enabled: boolean) => !enabled);
                    setSelectedJobIds([]);
                  }}
                  size="sm"
                  variant="outline"
                >
                  <ListChecks className="size-4" />
                  {selectionMode ? '退出批量处理' : '批量处理'}
                </Button>
              </div>
            ) : null}

            {selectionMode && selectableRecords.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-[#3370ff]/20 bg-[#eff4ff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#1e4bbd]">
                  <Checkbox
                    checked={isAllPageSelected}
                    onCheckedChange={togglePageSelection}
                  />
                  全选本页待处理记录（{selectableRecords.length}）
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-[#1e4bbd]/75">
                    已选择 {selectedCount} 条
                  </span>
                  <Button
                    className="rounded-xl bg-[#161616] text-white hover:bg-[#3370ff]"
                    disabled={selectedCount === 0 || batchProcessing}
                    onClick={() => void markSelectedProcessed()}
                    size="sm"
                  >
                    <CheckCircle2 className="size-4" />
                    {batchProcessing ? '同步中' : '批量标记已处理'}
                  </Button>
                  <Button
                    className="rounded-xl text-[#1e4bbd]"
                    onClick={() => setSelectedJobIds([])}
                    size="sm"
                    variant="ghost"
                  >
                    <X className="size-4" />
                    清空
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="grid min-h-72 place-items-center rounded-[2rem] border border-black/7 bg-white/85">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-6 animate-spin text-[#3370ff]" />
                <p className="mt-3 text-sm text-black/45">正在整理历史记录…</p>
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="grid min-h-72 place-items-center rounded-[2rem] border border-dashed border-black/12 bg-white/75 px-6 text-center">
              <div>
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-black/5 text-black/35">
                  <History className="size-6" />
                </div>
                <h2 className="mt-5 text-lg font-semibold">
                  没有符合条件的转化记录
                </h2>
                <p className="mt-2 text-sm leading-6 text-black/45">
                  完成一次视频或录音转化后，记录会自动出现在这里。
                </p>
                <Button
                  asChild
                  className="mt-6 rounded-xl bg-[#161616] text-white"
                >
                  <Link to="/">开始第一次转化</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3" data-ai-section-type="card-list">
              {records.map((record: NoteConversionRecord) => {
                const sourceStyle = SOURCE_STYLES[record.sourceType];
                const selectable: boolean = isSelectable(record);
                return (
                  <article
                    className="group rounded-3xl border border-black/7 bg-white/92 p-5 shadow-[0_14px_45px_rgba(40,35,29,0.055)] transition hover:-translate-y-0.5 hover:border-black/12 hover:shadow-[0_18px_55px_rgba(40,35,29,0.09)] md:p-6"
                    key={record.id}
                  >
                    <div className="flex gap-4">
                      {selectionMode ? (
                        <Checkbox
                          aria-label={`选择 ${record.title}`}
                          checked={selectedJobIds.includes(record.jobId)}
                          className="mt-4"
                          disabled={!selectable}
                          onCheckedChange={() =>
                            toggleRecordSelection(record.jobId)
                          }
                        />
                      ) : null}
                      <div
                        className="grid size-12 shrink-0 place-items-center rounded-2xl"
                        style={{
                          backgroundColor: sourceStyle.background,
                          color: sourceStyle.accent,
                        }}
                      >
                        <ConversionIcon sourceType={record.sourceType} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            className="border-transparent"
                            style={{
                              backgroundColor: sourceStyle.background,
                              color: sourceStyle.accent,
                            }}
                            variant="outline"
                          >
                            {record.sourceLabel}
                          </Badge>
                          <Badge
                            variant={
                              record.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {getStatusCopy(record)}
                          </Badge>
                          <Badge
                            className={
                              record.processingStatus === 'processed'
                                ? 'border-transparent bg-emerald-50 text-emerald-700'
                                : 'border-transparent bg-amber-50 text-amber-700'
                            }
                            variant="outline"
                          >
                            {record.processingStatus === 'processed'
                              ? '已处理'
                              : '待处理'}
                          </Badge>
                          {record.noteStyle ? (
                            <Badge variant="outline">
                              {record.noteStyle === 'learning'
                                ? '学习笔记'
                                : '会议纪要'}
                              {record.promptVersionId
                                ? ' · 已存提示词快照'
                                : ''}
                            </Badge>
                          ) : null}
                        </div>
                        <h2 className="mt-3 truncate text-lg font-semibold tracking-[-0.02em]">
                          {record.title}
                        </h2>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-black/42">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="size-3.5" />
                            {dayjs(record.startedAt).format('YYYY-MM-DD HH:mm')}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            {record.status === 'failed' ? (
                              <TriangleAlert className="size-3.5 text-red-500" />
                            ) : (
                              <CheckCircle2 className="size-3.5" />
                            )}
                            耗时 {record.durationLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 border-t border-black/6 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        {record.documentUrl ? (
                          <Button
                            asChild
                            className="rounded-xl bg-[#3370ff] text-white hover:bg-[#2864ea]"
                            size="sm"
                          >
                            <a
                              href={record.documentUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              查看总结笔记
                              <ArrowUpRight className="size-4" />
                            </a>
                          </Button>
                        ) : null}
                        {record.larkTaskUrl ? (
                          <Button
                            asChild
                            className="rounded-xl border-black/10 bg-white text-black/70 hover:bg-black/5"
                            size="sm"
                            variant="outline"
                          >
                            <a
                              href={record.larkTaskUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              查看待处理任务
                              <ArrowUpRight className="size-4" />
                            </a>
                          </Button>
                        ) : null}
                        {record.rawDocumentUrl ||
                        record.rawTranscriptAvailable ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                className="rounded-xl border-black/10 bg-white text-black/70 hover:bg-black/5"
                                size="sm"
                                variant="outline"
                              >
                                更多
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {record.rawDocumentUrl ? (
                                <DropdownMenuItem asChild>
                                  <a
                                    href={record.rawDocumentUrl}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                  >
                                    查看原文
                                    <ArrowUpRight className="size-4" />
                                  </a>
                                </DropdownMenuItem>
                              ) : null}
                              {record.rawTranscriptAvailable ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    void downloadTranscript(record)
                                  }
                                >
                                  下载原文
                                  <Download className="size-4" />
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                        {!record.documentUrl && !record.rawDocumentUrl ? (
                          <span className="text-xs text-black/35">
                            {record.status === 'processing'
                              ? '完成后可查看'
                              : '没有生成笔记'}
                          </span>
                        ) : null}
                      </div>
                      {record.status === 'completed' ? (
                        <Button
                          className={
                            record.processingStatus === 'processed'
                              ? 'rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                              : 'rounded-xl bg-[#161616] text-white hover:bg-[#3370ff]'
                          }
                          disabled={
                            record.processingStatus === 'processed' ||
                            markingJobId === record.jobId
                          }
                          onClick={() => void markProcessed(record)}
                          size="sm"
                          variant={
                            record.processingStatus === 'processed'
                              ? 'outline'
                              : 'default'
                          }
                        >
                          <CheckCircle2 className="size-4" />
                          {record.processingStatus === 'processed'
                            ? '已处理'
                            : markingJobId === record.jobId
                              ? '同步中'
                              : '标记已处理'}
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!loading && totalPages > 1 ? (
            <nav
              aria-label="转化记录分页"
              className="mt-7 flex flex-wrap items-center justify-center gap-3"
            >
              <Button
                className="rounded-xl border-black/10 bg-white text-black/65"
                disabled={page === 1}
                onClick={() => setPage((current: number) => current - 1)}
                variant="outline"
              >
                <ChevronLeft className="size-4" />
                上一页
              </Button>
              <span className="text-sm text-black/48">
                第 {page} / {totalPages} 页
              </span>
              <Button
                className="rounded-xl border-black/10 bg-white text-black/65"
                disabled={page >= totalPages}
                onClick={() => setPage((current: number) => current + 1)}
                variant="outline"
              >
                下一页
                <ChevronRight className="size-4" />
              </Button>
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
