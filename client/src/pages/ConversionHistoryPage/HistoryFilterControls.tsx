import dayjs from 'dayjs';
import { CalendarDays, RotateCcw, Search } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ConversionStatus,
  NoteProcessingStatus,
  NoteSourceType,
} from '@shared/api.interface';
import type { ConversionSourceChannel } from './conversion-history-search-params';

interface HistoryFilterValues {
  dateFrom?: string;
  dateTo?: string;
  processingStatus?: NoteProcessingStatus;
  sourceChannel?: ConversionSourceChannel;
  sourceType?: NoteSourceType;
  status?: ConversionStatus;
}

interface HistoryFilterControlsProps {
  keyword: string;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onKeywordChange: (value: string) => void;
  onKeywordSubmit: () => void;
  onProcessingStatusChange: (value: NoteProcessingStatus | undefined) => void;
  onReset: () => void;
  onSourceChannelChange: (
    value: ConversionSourceChannel | undefined,
  ) => void;
  onSourceTypeChange: (value: NoteSourceType | undefined) => void;
  onStatusChange: (value: ConversionStatus | undefined) => void;
  values: HistoryFilterValues;
}

const SOURCE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '全部类型', value: 'all' },
  { label: '平台视频', value: 'platform' },
  { label: '本地视频', value: 'video' },
  { label: '录音', value: 'audio' },
  { label: '双源会议/培训', value: 'paired' },
  { label: '文档', value: 'document' },
  { label: 'PDF', value: 'pdf' },
];

const SOURCE_CHANNEL_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '全部来源', value: 'all' },
  { label: '飞书收集箱', value: 'feishu_inbox' },
  { label: '手工提交', value: 'manual' },
];

const STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '全部结果', value: 'all' },
  { label: '已完成', value: 'completed' },
  { label: '处理中', value: 'processing' },
  { label: '失败', value: 'failed' },
];

const PROCESSING_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '全部处理状态', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '已处理', value: 'processed' },
];

function parseSourceType(value: string): NoteSourceType | undefined {
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

function parseSourceChannel(value: string): ConversionSourceChannel | undefined {
  if (value === 'feishu_inbox' || value === 'manual') return value;
  return undefined;
}

function parseStatus(value: string): ConversionStatus | undefined {
  if (value === 'completed' || value === 'processing' || value === 'failed') {
    return value;
  }
  return undefined;
}

function parseProcessingStatus(
  value: string,
): NoteProcessingStatus | undefined {
  if (value === 'pending' || value === 'processed') return value;
  return undefined;
}

function parseDate(value?: string): Date | undefined {
  return value ? dayjs(value, 'YYYY-MM-DD').toDate() : undefined;
}

function getDateRangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return '生成日期';
  if (!range.to) return dayjs(range.from).format('YYYY-MM-DD');
  return `${dayjs(range.from).format('MM-DD')} 至 ${dayjs(range.to).format('MM-DD')}`;
}

export function HistoryFilterControls({
  keyword,
  onDateRangeChange,
  onKeywordChange,
  onKeywordSubmit,
  onProcessingStatusChange,
  onReset,
  onSourceChannelChange,
  onSourceTypeChange,
  onStatusChange,
  values,
}: HistoryFilterControlsProps) {
  const dateRange: DateRange | undefined = values.dateFrom
    ? {
        from: parseDate(values.dateFrom),
        to: parseDate(values.dateTo),
      }
    : undefined;
  const hasActiveFilters: boolean = Boolean(
    keyword ||
    values.dateFrom ||
    values.dateTo ||
    values.processingStatus ||
    values.sourceChannel ||
    values.sourceType ||
    values.status,
  );

  return (
    <div className="rounded-2xl border border-black/8 bg-white/82 p-3 shadow-[0_10px_30px_rgba(40,35,29,0.04)]">
      <div className="grid gap-2 xl:grid-cols-[minmax(12rem,1.35fr)_repeat(4,minmax(9rem,1fr))_auto]">
        <div className="flex min-w-0 gap-2">
          <Input
            aria-label="按笔记标题搜索"
            className="h-9 min-w-0 border-black/10 bg-white text-sm"
            onChange={(event) => onKeywordChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onKeywordSubmit();
            }}
            placeholder="搜索笔记标题"
            value={keyword}
          />
          <Button
            aria-label="搜索"
            className="shrink-0 rounded-xl bg-[#161616] text-white hover:bg-[#3370ff]"
            onClick={onKeywordSubmit}
            size="icon"
          >
            <Search className="size-4" />
          </Button>
        </div>
        <Select
          onValueChange={(value: string) =>
            onSourceChannelChange(parseSourceChannel(value))
          }
          value={values.sourceChannel || 'all'}
        >
          <SelectTrigger className="h-9 w-full border-black/10 bg-white text-sm">
            <SelectValue placeholder="来源渠道" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_CHANNEL_OPTIONS.map(
              (option: { label: string; value: string }) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value: string) =>
            onSourceTypeChange(parseSourceType(value))
          }
          value={values.sourceType || 'all'}
        >
          <SelectTrigger className="h-9 w-full border-black/10 bg-white text-sm">
            <SelectValue placeholder="资料类型" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((option: { label: string; value: string }) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value: string) => onStatusChange(parseStatus(value))}
          value={values.status || 'all'}
        >
          <SelectTrigger className="h-9 w-full border-black/10 bg-white text-sm">
            <SelectValue placeholder="转化结果" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option: { label: string; value: string }) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value: string) =>
            onProcessingStatusChange(parseProcessingStatus(value))
          }
          value={values.processingStatus || 'all'}
        >
          <SelectTrigger className="h-9 w-full border-black/10 bg-white text-sm">
            <SelectValue placeholder="处理状态" />
          </SelectTrigger>
          <SelectContent>
            {PROCESSING_OPTIONS.map(
              (option: { label: string; value: string }) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        {hasActiveFilters ? (
          <Button
            className="rounded-xl border-black/10 bg-white text-black/60 hover:bg-black/5"
            onClick={onReset}
            size="sm"
            variant="outline"
          >
            <RotateCcw className="size-3.5" />
            重置
          </Button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              className="rounded-xl border-black/10 bg-white text-black/60 hover:bg-black/5"
              size="sm"
              variant="outline"
            >
              <CalendarDays className="size-3.5" />
              {getDateRangeLabel(dateRange)}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              numberOfMonths={1}
              onSelect={onDateRangeChange}
              selected={dateRange}
            />
          </PopoverContent>
        </Popover>
        {dateRange ? (
          <Button
            className="h-8 rounded-xl text-black/50"
            onClick={() => onDateRangeChange(undefined)}
            size="sm"
            variant="ghost"
          >
            清除日期
          </Button>
        ) : null}
      </div>
    </div>
  );
}
