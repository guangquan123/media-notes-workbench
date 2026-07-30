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
  HardDrive,
  History,
  ImageIcon,
  ListChecks,
  LoaderCircle,
  MoreHorizontal,
  Repeat2,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { DateRange } from 'react-day-picker';

import {
  downloadRawTranscript,
  getNoteConversionHistory,
  markNoteProcessed,
  markNoteProcessedBatch,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadBlob } from '@/utils/download';
import type {
  ConversionStatus,
  NoteConversionHistoryPagination,
  NoteConversionRecord,
  NoteProcessingStatus,
  NoteSourceType,
  NoteVisualOptions,
} from '@shared/api.interface';
import { VisualOptionsPanel } from '@/components/note-visuals/VisualOptionsPanel';
import { HistoryFilterControls } from './HistoryFilterControls';
import { SourceDeletionDialog } from './SourceDeletionDialog';
import {
  buildConversionHistorySearchParams,
  type ConversionSourceChannel,
} from './conversion-history-search-params';
import {
  getSourceAssetCapabilities,
  getSourceAssetCopy,
} from './conversion-history-source.utils';
import { getVisualOptionsCopy } from './conversion-history-visual.utils';
import { useHistoryReprocessing } from './useHistoryReprocessing';

const PAGE_SIZE = 10;

const STAGE_LABELS: Record<string, string> = {
  aligning: '对齐音视频',
  'analyzing-frames': '识别关键画面',
  'awaiting-frame-review': '等待确认关键画面',
  checking: '检查运行环境',
  downloading: '下载媒体',
  'extracting-frames': '提取关键画面',
  parsing: '解析文件',
  preparing: '准备媒体',
  publishing: '写入飞书文档',
  queued: '排队等待处理',
  summarizing: '生成学习笔记',
  transcribing: '语音转文字',
  uploading: '上传媒体',
  'uploading-frames': '上传关键画面',
};

function getStageLabel(stage?: string): string {
  return (stage && STAGE_LABELS[stage]) || '处理中';
}

const SOURCE_STYLES: Record<
  NoteSourceType,
  { accent: string; background: string }
> = {
  platform: { accent: '#fb7299', background: '#fff0f5' },
  video: { accent: '#e86f3d', background: '#fff2eb' },
  audio: { accent: '#168b75', background: '#eaf8f4' },
  paired: { accent: '#4d5dff', background: '#eef1ff' },
  pdf: { accent: '#3370ff', background: '#edf3ff' },
  document: { accent: '#3370ff', background: '#edf3ff' },
};

function getStatusCopy(record: NoteConversionRecord): string {
  if (record.status === 'completed') return '已完成';
  if (record.status === 'failed') return '失败';
  return '处理中';
}

function getRerunModeCopy(record: NoteConversionRecord): string {
  if (record.rerunMode === 'regenerate_note') return '笔记重生成';
  if (record.rerunMode === 'full_reprocess') return '完整重跑';
  return '首次处理';
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

function getSourceType(value: string | null): NoteSourceType | undefined {
  if (
    value === 'platform' ||
    value === 'video' ||
    value === 'audio' ||
    value === 'paired' ||
    value === 'document' ||
    value === 'pdf'
  ) {
    return value;
  }
  return undefined;
}

function getConversionStatus(
  value: string | null,
): ConversionStatus | undefined {
  if (value === 'completed' || value === 'processing' || value === 'failed') {
    return value;
  }
  return undefined;
}

function getProcessingStatus(
  value: string | null,
): NoteProcessingStatus | undefined {
  if (value === 'pending' || value === 'processed') return value;
  return undefined;
}

function getDateParam(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : undefined;
}

function getSourceChannel(
  value: string | null,
): ConversionSourceChannel | undefined {
  if (value === 'feishu_inbox' || value === 'manual') return value;
  return undefined;
}

export default function ConversionHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<NoteConversionRecord[]>([]);
  const [pagination, setPagination] =
    useState<NoteConversionHistoryPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');
  const jobId = searchParams.get('jobId') || undefined;
  const [sourceChannel, setSourceChannel] = useState<
    ConversionSourceChannel | undefined
  >(getSourceChannel(searchParams.get('sourceChannel')));
  const [appliedKeyword, setAppliedKeyword] = useState(
    searchParams.get('keyword') || '',
  );
  const [sourceType, setSourceType] = useState<NoteSourceType | undefined>(
    getSourceType(searchParams.get('sourceType')),
  );
  const [status, setStatus] = useState<ConversionStatus | undefined>(
    getConversionStatus(searchParams.get('status')),
  );
  const [processingStatus, setProcessingStatus] = useState<
    NoteProcessingStatus | undefined
  >(getProcessingStatus(searchParams.get('processingStatus')));
  const [dateFrom, setDateFrom] = useState<string | undefined>(
    getDateParam(searchParams.get('dateFrom')),
  );
  const [dateTo, setDateTo] = useState<string | undefined>(
    getDateParam(searchParams.get('dateTo')),
  );
  const [page, setPage] = useState(() => {
    const parsedPage: number = Number.parseInt(
      searchParams.get('page') || '',
      10,
    );
    return Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [markingJobId, setMarkingJobId] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [imageReprocessRecord, setImageReprocessRecord] =
    useState<NoteConversionRecord | null>(null);
  const [imageReprocessOptions, setImageReprocessOptions] =
    useState<NoteVisualOptions>({ mode: 'disabled' });

  const loadRecords = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await getNoteConversionHistory({
        dateFrom,
        dateTo,
        keyword: appliedKeyword || undefined,
        jobId,
        sourceChannel,
        page,
        pageSize: PAGE_SIZE,
        processingStatus,
        sourceType,
        status,
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
  }, [
    appliedKeyword,
    jobId,
    sourceChannel,
    dateFrom,
    dateTo,
    page,
    processingStatus,
    sourceType,
    status,
  ]);

  const hasProcessingRecords: boolean = records.some(
    (record: NoteConversionRecord): boolean => record.status === 'processing',
  );

  useEffect(() => {
    if (!hasProcessingRecords) return undefined;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const response = await getNoteConversionHistory({
          dateFrom,
          dateTo,
          keyword: appliedKeyword || undefined,
          jobId,
          sourceChannel,
          page,
          pageSize: PAGE_SIZE,
          processingStatus,
          sourceType,
          status,
        });
        if (!cancelled) {
          setRecords(response.items);
          setPagination(response.pagination);
        }
      } catch {
        // Keep the current progress visible through a transient poll failure.
      }
    };
    const timer = window.setInterval(() => void poll(), 2200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    appliedKeyword,
    dateFrom,
    dateTo,
    hasProcessingRecords,
    jobId,
    page,
    processingStatus,
    sourceChannel,
    sourceType,
    status,
  ]);

  useEffect(() => {
    const nextSearchParams: URLSearchParams =
      buildConversionHistorySearchParams({
        dateFrom,
        dateTo,
        jobId,
        keyword: appliedKeyword || undefined,
        page,
        processingStatus,
        sourceChannel,
        sourceType,
        status,
      });
    setSearchParams(nextSearchParams, { replace: true });
  }, [
    appliedKeyword,
    dateFrom,
    dateTo,
    jobId,
    page,
    processingStatus,
    setSearchParams,
    sourceChannel,
    sourceType,
    status,
  ]);

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

  const resetFilters = () => {
    setKeyword('');
    setAppliedKeyword('');
    setSourceChannel(undefined);
    setSourceType(undefined);
    setStatus(undefined);
    setProcessingStatus(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
    setSelectedJobIds([]);
  };

  const changeSourceType = (value: NoteSourceType | undefined) => {
    setSourceType(value);
    setPage(1);
    setSelectedJobIds([]);
  };

  const changeSourceChannel = (
    value: ConversionSourceChannel | undefined,
  ) => {
    setSourceChannel(value);
    setPage(1);
    setSelectedJobIds([]);
  };

  const changeStatus = (value: ConversionStatus | undefined) => {
    setStatus(value);
    setPage(1);
    setSelectedJobIds([]);
  };

  const changeProcessingStatus = (value: NoteProcessingStatus | undefined) => {
    setProcessingStatus(value);
    setPage(1);
    setSelectedJobIds([]);
  };

  const changeDateRange = (range: DateRange | undefined) => {
    setDateFrom(
      range?.from ? dayjs(range.from).format('YYYY-MM-DD') : undefined,
    );
    setDateTo(range?.to ? dayjs(range.to).format('YYYY-MM-DD') : undefined);
    setPage(1);
    setSelectedJobIds([]);
  };

  const openImageReprocess = (record: NoteConversionRecord) => {
    setImageReprocessRecord(record);
    setImageReprocessOptions(record.visualOptions || { mode: 'disabled' });
  };

  const submitImageReprocess = async () => {
    if (!imageReprocessRecord || imageReprocessOptions.mode === 'disabled') {
      return;
    }
    await reprocessImages(imageReprocessRecord, imageReprocessOptions);
    setImageReprocessRecord(null);
  };

  const totalPages: number = pagination?.totalPages || 0;
  const totalItems: number = pagination?.totalItems || 0;
  const {
    actionJobId,
    deleteRetainedSource,
    deletingSource,
    fullyReprocess,
    reprocessImages,
    regenerateRaw,
    regenerateSummary,
    setSourceToDelete,
    sourceToDelete,
  } = useHistoryReprocessing({
    onRecordsChanged: () => loadRecords(true),
  });

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
          <div className="mb-6 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">
                    转化记录
                  </h1>
                  {!loading ? (
                    <span className="text-sm text-black/42">
                      共 {totalItems} 条
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-black/45">
                  按资料类型、生成时间和处理状态快速定位笔记
                </p>
              </div>
              {!loading && totalItems > 0 ? (
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
              ) : null}
            </div>
            <HistoryFilterControls
              keyword={keyword}
              onDateRangeChange={changeDateRange}
              onKeywordChange={setKeyword}
              onKeywordSubmit={() => {
                setAppliedKeyword(keyword.trim());
                setPage(1);
                setSelectedJobIds([]);
              }}
              onProcessingStatusChange={changeProcessingStatus}
              onReset={resetFilters}
              onSourceChannelChange={changeSourceChannel}
              onSourceTypeChange={changeSourceType}
              onStatusChange={changeStatus}
              values={{
                dateFrom,
                dateTo,
                processingStatus,
                sourceChannel,
                sourceType,
                status,
              }}
            />

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
                const sourceCapabilities = getSourceAssetCapabilities(
                  record.sourceAssets,
                );
                const taskFinished: boolean =
                  record.status !== 'processing';
                const canRegenerate: boolean =
                  taskFinished && record.rawTranscriptAvailable;
                const canFullReprocess: boolean =
                  taskFinished && sourceCapabilities.canReprocess;
                const visualOptionsCopy = getVisualOptionsCopy(
                  record.visualOptions,
                );
                const canReprocessImages: boolean =
                  canFullReprocess && visualOptionsCopy.enabled;
                const canDeleteSource: boolean =
                  taskFinished && sourceCapabilities.canDelete;
                const hasMoreActions: boolean =
                  Boolean(record.rawDocumentUrl) ||
                  record.rawTranscriptAvailable ||
                  canDeleteSource ||
                  canFullReprocess;
                const actionRunning: boolean =
                  actionJobId === record.jobId;
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
                          <Badge variant="outline">
                            V{record.versionNumber} ·{' '}
                            {getRerunModeCopy(record)}
                          </Badge>
                          <Badge
                            className={
                              visualOptionsCopy.enabled
                                ? 'border-transparent bg-violet-50 text-violet-700'
                                : 'border-transparent bg-black/5 text-black/48'
                            }
                            variant="outline"
                          >
                            <ImageIcon className="mr-1 size-3" />
                            {visualOptionsCopy.title}
                          </Badge>
                        </div>
                        <h2 className="mt-3 truncate text-lg font-semibold tracking-[-0.02em]">
                          {record.title}
                        </h2>
                        {record.status === 'processing' ? (
                          <div className="mt-4 max-w-2xl rounded-xl bg-[#f5f7fb] px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3 text-xs text-black/55">
                              <span className="font-medium text-[#3370ff]">
                                {getStageLabel(record.currentStage)}
                              </span>
                              <span>{Math.round(record.progress ?? 0)}%</span>
                            </div>
                            <Progress
                              className="mt-2 h-1.5"
                              value={record.progress ?? 0}
                            />
                            <p className="mt-2 truncate text-xs text-black/48">
                              {record.statusMessage || '任务正在后台处理…'}
                            </p>
                          </div>
                        ) : record.status === 'failed' && record.error ? (
                          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                            {record.error}
                          </p>
                        ) : null}
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
                          <span className="inline-flex items-center gap-1.5">
                            <HardDrive className="size-3.5" />
                            {getSourceAssetCopy(record.sourceAssets)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <ImageIcon className="size-3.5" />
                            {visualOptionsCopy.detail}
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
                        {hasMoreActions ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                className="rounded-xl border-black/10 bg-white text-black/70 hover:bg-black/5"
                                disabled={actionRunning}
                                size="sm"
                                variant="outline"
                              >
                                {actionRunning ? '处理中' : '更多'}
                                {actionRunning ? (
                                  <LoaderCircle className="size-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="size-4" />
                                )}
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
                              {(record.rawDocumentUrl ||
                                record.rawTranscriptAvailable) &&
                              (canRegenerate ||
                                canFullReprocess ||
                                canDeleteSource) ? (
                                <DropdownMenuSeparator />
                              ) : null}
                              {canRegenerate ? (
                                <DropdownMenuItem
                                  onClick={() => void regenerateRaw(record)}
                                >
                                  重新生成原文
                                  <FileText className="size-4" />
                                </DropdownMenuItem>
                              ) : null}
                              {canRegenerate ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    void regenerateSummary(record)
                                  }
                                >
                                  仅重新生成笔记
                                  <Repeat2 className="size-4" />
                                </DropdownMenuItem>
                              ) : null}
                              {canReprocessImages ? (
                                <DropdownMenuItem
                                  onClick={() => openImageReprocess(record)}
                                >
                                  重新处理图片
                                  <ImageIcon className="size-4" />
                                </DropdownMenuItem>
                              ) : null}
                              {canFullReprocess ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    void fullyReprocess(record)
                                  }
                                >
                                  用源文件完整重跑
                                  <RefreshCw className="size-4" />
                                </DropdownMenuItem>
                              ) : null}
                              {canDeleteSource ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onClick={() =>
                                      setSourceToDelete(record)
                                    }
                                  >
                                    永久删除源文件
                                    <Trash2 className="size-4" />
                                  </DropdownMenuItem>
                                </>
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
        <SourceDeletionDialog
        deleting={deletingSource}
        onConfirm={() => void deleteRetainedSource()}
        onOpenChange={(open: boolean) => {
          if (!open && !deletingSource) setSourceToDelete(null);
        }}
        record={sourceToDelete}
        />
        <Dialog
          onOpenChange={(open) => {
            if (!open) setImageReprocessRecord(null);
          }}
          open={imageReprocessRecord !== null}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>重新处理图片</DialogTitle>
              <DialogDescription>
                将创建新的转化版本，原笔记和原始图片保持不变。
              </DialogDescription>
            </DialogHeader>
            <VisualOptionsPanel
              disabled={actionJobId === imageReprocessRecord?.jobId}
              onChange={setImageReprocessOptions}
              value={imageReprocessOptions}
            />
            <DialogFooter>
              <Button
                disabled={
                  imageReprocessOptions.mode === 'disabled' ||
                  actionJobId === imageReprocessRecord?.jobId
                }
                onClick={() => void submitImageReprocess()}
              >
                {actionJobId === imageReprocessRecord?.jobId
                  ? '正在创建任务'
                  : '创建图片重处理版本'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </main>
  );
}
