import type { NoteSourceType, SourcePlatform } from '@shared/api.interface';

const HISTORY_PAGE_SIZE = 10;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

interface HistoryDateRange {
  startedAtBefore?: Date;
  startedAtFrom?: Date;
}

function normalizeHistoryPagination(
  pageValue?: string,
  pageSizeValue?: string,
): { page: number; pageSize: number } {
  const parsedPage: number = Number.parseInt(pageValue || '', 10);
  const parsedPageSize: number = Number.parseInt(pageSizeValue || '', 10);
  return {
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      parsedPageSize === HISTORY_PAGE_SIZE ? parsedPageSize : HISTORY_PAGE_SIZE,
  };
}

function normalizeHistoryDateRange(
  dateFrom?: string,
  dateTo?: string,
): HistoryDateRange {
  const normalizedFrom: string | undefined = normalizeHistoryDate(dateFrom);
  const normalizedTo: string | undefined = normalizeHistoryDate(dateTo);
  if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
    throw new Error('开始日期不能晚于结束日期');
  }
  const startedAtFrom: Date | undefined = normalizedFrom
    ? new Date(`${normalizedFrom}T00:00:00+08:00`)
    : undefined;
  const startedAtBefore: Date | undefined = normalizedTo
    ? new Date(`${normalizedTo}T00:00:00+08:00`)
    : undefined;
  if (startedAtBefore)
    startedAtBefore.setUTCDate(startedAtBefore.getUTCDate() + 1);
  return { startedAtBefore, startedAtFrom };
}

function normalizeHistoryDate(value?: string): string | undefined {
  if (!value) return undefined;
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new Error('日期格式应为 YYYY-MM-DD');
  }
  const [year, month, day]: number[] = value
    .split('-')
    .map((part: string) => Number(part));
  const validationDate: Date = new Date(Date.UTC(year, month - 1, day));
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day
  ) {
    throw new Error('日期格式应为 YYYY-MM-DD');
  }
  return value;
}

function normalizeHistoryKeyword(value?: string): string | undefined {
  const keyword: string = value?.trim().slice(0, 100) || '';
  return keyword || undefined;
}

function calculateDurationMs(startedAt: Date, completedAt: Date): number {
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '处理中';
  const totalSeconds: number = Math.max(0, Math.round(durationMs / 1000));
  const minutes: number = Math.floor(totalSeconds / 60);
  const seconds: number = totalSeconds % 60;
  if (minutes === 0) return `${seconds} 秒`;
  if (seconds === 0) return `${minutes} 分钟`;
  return `${minutes} 分 ${seconds} 秒`;
}

function getConversionTypeLabel(
  sourceType: NoteSourceType,
  sourcePlatform?: SourcePlatform,
): string {
  if (sourceType === 'video') return '本地视频';
  if (sourceType === 'audio') return '录音';
  if (sourceType === 'document') return '文档资料';
  if (sourceType === 'pdf') return 'PDF 资料';
  return sourcePlatform === 'douyin' ? '抖音视频' : 'B站视频';
}

export {
  calculateDurationMs,
  formatDuration,
  getConversionTypeLabel,
  normalizeHistoryDateRange,
  normalizeHistoryKeyword,
  normalizeHistoryPagination,
};
