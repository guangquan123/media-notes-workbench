import { BadRequestException } from '@nestjs/common';
import type {
  MediaCleanupFrequency,
  UpdateMediaCleanupSettingsRequest,
} from '@shared/api.interface';

export interface StoredMediaCleanupConfig extends UpdateMediaCleanupSettingsRequest {
  lastRunAt: string | null;
  lastRunKey: string | null;
  lastRunSource: 'manual' | 'scheduled' | null;
  ownerId: string;
  timezone: 'Asia/Shanghai';
}

export const DEFAULT_MEDIA_CLEANUP_CONFIG: StoredMediaCleanupConfig = {
  deleteFailedRecords: false,
  deleteOrphanFiles: true,
  enabled: false,
  frequency: 'weekly',
  lastRunAt: null,
  lastRunKey: null,
  lastRunSource: null,
  monthlyDay: 1,
  ownerId: '',
  retentionDays: 30,
  scheduledTime: '03:00',
  timezone: 'Asia/Shanghai',
  weeklyDay: 0,
};

interface ShanghaiDateParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  weekday: number;
  year: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toShanghaiParts(date: Date): ShanghaiDateParts {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    month: shifted.getUTCMonth() + 1,
    weekday: shifted.getUTCDay(),
    year: shifted.getUTCFullYear(),
  };
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || hour > 23 || minute > 59) {
    throw new BadRequestException('定时清理时间必须是 HH:mm 格式。');
  }
  return { hour, minute };
}

function isFrequency(value: string): value is MediaCleanupFrequency {
  return value === 'daily' || value === 'weekly' || value === 'monthly';
}

export function normalizeMediaCleanupSettings(
  input: UpdateMediaCleanupSettingsRequest,
): UpdateMediaCleanupSettingsRequest {
  if (!isFrequency(input.frequency)) {
    throw new BadRequestException('不支持的清理周期。');
  }
  parseTime(input.scheduledTime);
  if (
    !Number.isInteger(input.retentionDays) ||
    input.retentionDays < 1 ||
    input.retentionDays > 3650
  ) {
    throw new BadRequestException('媒体保留天数必须是 1 到 3650 的整数。');
  }
  if (
    !Number.isInteger(input.weeklyDay) ||
    input.weeklyDay < 0 ||
    input.weeklyDay > 6
  ) {
    throw new BadRequestException('每周执行日必须在 0 到 6 之间。');
  }
  if (
    !Number.isInteger(input.monthlyDay) ||
    input.monthlyDay < 1 ||
    input.monthlyDay > 28
  ) {
    throw new BadRequestException('每月执行日必须在 1 到 28 之间。');
  }
  return {
    deleteFailedRecords: input.deleteFailedRecords === true,
    deleteOrphanFiles: input.deleteOrphanFiles === true,
    enabled: input.enabled === true,
    frequency: input.frequency,
    monthlyDay: input.monthlyDay,
    retentionDays: input.retentionDays,
    scheduledTime: input.scheduledTime,
    weeklyDay: input.weeklyDay,
  };
}

export function getMediaCleanupRunKey(
  frequency: MediaCleanupFrequency,
  now: Date,
): string {
  const parts = toShanghaiParts(now);
  if (frequency === 'monthly') {
    return `${parts.year}-${pad(parts.month)}`;
  }
  if (frequency === 'weekly') {
    const localMidnightUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
    const weekStart = new Date(localMidnightUtc - parts.weekday * 86400000);
    return `${weekStart.getUTCFullYear()}-${pad(weekStart.getUTCMonth() + 1)}-${pad(weekStart.getUTCDate())}`;
  }
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function isMediaCleanupDue(
  config: StoredMediaCleanupConfig,
  now: Date,
): boolean {
  if (!config.enabled || !config.ownerId) return false;
  const parts = toShanghaiParts(now);
  const scheduled = parseTime(config.scheduledTime);
  const reachedTime =
    parts.hour > scheduled.hour ||
    (parts.hour === scheduled.hour && parts.minute >= scheduled.minute);
  const periodReached =
    config.frequency === 'daily'
      ? reachedTime
      : config.frequency === 'weekly'
        ? parts.weekday > config.weeklyDay ||
          (parts.weekday === config.weeklyDay && reachedTime)
        : parts.day > config.monthlyDay ||
          (parts.day === config.monthlyDay && reachedTime);
  return (
    periodReached &&
    config.lastRunKey !== getMediaCleanupRunKey(config.frequency, now)
  );
}

function matchesScheduleDate(
  config: StoredMediaCleanupConfig,
  parts: ShanghaiDateParts,
): boolean {
  if (config.frequency === 'daily') return true;
  if (config.frequency === 'weekly') return parts.weekday === config.weeklyDay;
  return parts.day === config.monthlyDay;
}

export function getNextMediaCleanupRunAt(
  config: StoredMediaCleanupConfig,
  now: Date,
): string | null {
  if (!config.enabled) return null;
  const { hour, minute } = parseTime(config.scheduledTime);
  const nowParts = toShanghaiParts(now);
  const localToday = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);
  for (let offset = 0; offset <= 370; offset += 1) {
    const localDate = new Date(localToday + offset * 86400000);
    const parts: ShanghaiDateParts = {
      day: localDate.getUTCDate(),
      hour,
      minute,
      month: localDate.getUTCMonth() + 1,
      weekday: localDate.getUTCDay(),
      year: localDate.getUTCFullYear(),
    };
    if (!matchesScheduleDate(config, parts)) continue;
    const candidate = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day, hour - 8, minute),
    );
    if (candidate.getTime() > now.getTime()) return candidate.toISOString();
  }
  return null;
}
