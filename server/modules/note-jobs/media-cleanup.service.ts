import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import type { AppDatabase } from '@server/database/database.types';
import { noteConversionRecords } from '@server/database/schema';
import type {
  ConversionStatus,
  MediaCleanupDeletedItem,
  MediaCleanupFileItem,
  MediaCleanupInventoryResponse,
  MediaCleanupRelatedNote,
  MediaCleanupRunHistoryItem,
  MediaCleanupRunHistoryResponse,
  MediaCleanupRunStatus,
  MediaCleanupRunResponse,
  MediaCleanupRunSource,
  MediaCleanupSettings,
  RetainedNoteSource,
  RetainedUploadedMedia,
  RunMediaCleanupRequest,
  StoredSourceObject,
  UpdateMediaCleanupSettingsRequest,
} from '@shared/api.interface';
import { parseRetainedNoteSource } from '@shared/note-reprocessing.utils';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NoteHistoryService } from './note-history.service';
import {
  DEFAULT_MEDIA_CLEANUP_CONFIG,
  getMediaCleanupRunKey,
  getNextMediaCleanupRunAt,
  isMediaCleanupDue,
  normalizeMediaCleanupSettings,
  type StoredMediaCleanupConfig,
} from './media-cleanup.utils';

interface CleanupRecordRow {
  completedAt: Date | null;
  jobId: string;
  ownerId: string;
  sourceAssetGroupId: string;
  sourceSnapshotJson: string | null;
  startedAt: Date;
  status: string;
  title: string;
}

interface ObjectReference {
  fileName: string;
  object: StoredSourceObject;
  record: CleanupRecordRow;
}

interface StoredMediaCleanupHistoryItem extends MediaCleanupRunHistoryItem {
  ownerId: string;
}

interface StoredMediaCleanupHistoryFile {
  items: StoredMediaCleanupHistoryItem[];
}

const MAX_MEDIA_CLEANUP_HISTORY_ITEMS = 200;

@Injectable()
export class MediaCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanupService.name);
  private readonly baseDir: string;
  private readonly configPath: string;
  private readonly historyPath: string;
  private readonly quarantineDir: string;
  private readonly uploadDir: string;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: AppDatabase,
    private readonly noteHistoryService: NoteHistoryService,
    @Optional() baseDir?: string,
  ) {
    this.baseDir = baseDir || process.cwd();
    this.configPath = join(this.baseDir, '.media-cleanup-config.json');
    this.historyPath = join(this.baseDir, '.media-cleanup-history.json');
    this.uploadDir = join(this.baseDir, 'data', 'uploads');
    this.quarantineDir = join(
      this.baseDir,
      'data',
      '.media-cleanup-quarantine',
    );
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.pollSchedule(), 60_000);
    this.timer.unref();
    void this.pollSchedule();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async getSettings(ownerId: string): Promise<MediaCleanupSettings> {
    const config = await this.loadConfig();
    const visibleConfig =
      config.ownerId && config.ownerId !== ownerId
        ? DEFAULT_MEDIA_CLEANUP_CONFIG
        : config;
    return this.toPublicSettings(visibleConfig);
  }

  async updateSettings(
    ownerId: string,
    input: UpdateMediaCleanupSettingsRequest,
  ): Promise<MediaCleanupSettings> {
    const current = await this.loadConfig();
    const normalized = normalizeMediaCleanupSettings(input);
    const next: StoredMediaCleanupConfig = {
      ...current,
      ...normalized,
      ownerId,
      timezone: 'Asia/Shanghai',
    };
    await this.saveConfig(next);
    return this.toPublicSettings(next);
  }

  async getInventory(ownerId: string): Promise<MediaCleanupInventoryResponse> {
    const config = await this.loadConfig();
    const effectiveConfig =
      config.ownerId && config.ownerId !== ownerId
        ? DEFAULT_MEDIA_CLEANUP_CONFIG
        : config;
    const references = await this.loadObjectReferences();
    const entries = await readdir(this.uploadDir, {
      withFileTypes: true,
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry): Promise<MediaCleanupFileItem> => {
          const absolutePath = resolve(this.uploadDir, entry.name);
          const fileStat = await stat(absolutePath);
          return this.classifyFile(
            ownerId,
            entry.name,
            absolutePath,
            fileStat.size,
            fileStat.mtime,
            references.get(entry.name) || [],
            effectiveConfig,
          );
        }),
    );
    files.sort((left, right) => right.fileSize - left.fileSize);
    return {
      files,
      generatedAt: new Date().toISOString(),
      summary: {
        eligibleBytes: files
          .filter((file) => file.eligible)
          .reduce((total, file) => total + file.fileSize, 0),
        eligibleFiles: files.filter((file) => file.eligible).length,
        orphanBytes: files
          .filter((file) => file.orphan)
          .reduce((total, file) => total + file.fileSize, 0),
        orphanFiles: files.filter((file) => file.orphan).length,
        protectedFiles: files.filter((file) => !file.eligible).length,
        totalBytes: files.reduce((total, file) => total + file.fileSize, 0),
        totalFiles: files.length,
      },
    };
  }

  async getHistory(ownerId: string): Promise<MediaCleanupRunHistoryResponse> {
    const items = (await this.loadHistory())
      .filter((item) => item.ownerId === ownerId)
      .sort((left, right) => right.finishedAt.localeCompare(left.finishedAt))
      .map(({ ownerId: _ownerId, ...item }) => item);
    return { items, totalItems: items.length };
  }

  async runCleanup(
    ownerId: string,
    input: RunMediaCleanupRequest,
    source: MediaCleanupRunSource = 'manual',
  ): Promise<MediaCleanupRunResponse> {
    if (this.running) {
      const finishedAt = new Date();
      const result: MediaCleanupRunResponse = {
        deletedBytes: 0,
        deletedFiles: 0,
        dryRun: input.dryRun === true,
        failed: [],
        finishedAt: finishedAt.toISOString(),
        skipped: [{ message: '已有清理任务正在执行。', objectId: '*' }],
        source,
      };
      await this.persistHistory(
        ownerId,
        this.toHistoryItem(result, finishedAt, finishedAt, [], 'failed'),
      );
      return result;
    }
    this.running = true;
    const startedAt = new Date();
    try {
      const inventory = await this.getInventory(ownerId);
      const requestedIds = new Set(
        (input.objectIds || []).map((value) => value.trim()).filter(Boolean),
      );
      const hasSelection = requestedIds.size > 0;
      const selected = inventory.files.filter((file) =>
        hasSelection ? requestedIds.has(file.objectId) : file.eligible,
      );
      const result: MediaCleanupRunResponse = {
        deletedBytes: 0,
        deletedFiles: 0,
        dryRun: input.dryRun === true,
        failed: [],
        finishedAt: '',
        skipped: [],
        source,
      };
      const deletedItems: MediaCleanupDeletedItem[] = [];
      for (const file of selected) {
        if (file.inUse || (!file.eligible && input.force !== true)) {
          result.skipped.push({
            message: file.reason,
            objectId: file.objectId,
          });
          continue;
        }
        if (!file.orphan && file.relatedNotes.length === 0) {
          result.skipped.push({
            message: '文件属于其他账号，禁止清理。',
            objectId: file.objectId,
          });
          continue;
        }
        const groupIds = new Set(
          file.relatedNotes.map((note) => note.sourceAssetGroupId),
        );
        if (groupIds.size > 1) {
          result.skipped.push({
            message: '文件被多个来源组引用，需逐条人工处理。',
            objectId: file.objectId,
          });
          continue;
        }
        if (result.dryRun) {
          result.deletedBytes += file.fileSize;
          result.deletedFiles += 1;
          deletedItems.push({
            fileName: file.fileName,
            fileSize: file.fileSize,
            objectId: file.objectId,
          });
          continue;
        }
        try {
          await this.deleteFile(ownerId, file);
          result.deletedBytes += file.fileSize;
          result.deletedFiles += 1;
          deletedItems.push({
            fileName: file.fileName,
            fileSize: file.fileSize,
            objectId: file.objectId,
          });
        } catch (error) {
          result.failed.push({
            message: error instanceof Error ? error.message : String(error),
            objectId: file.objectId,
          });
        }
      }
      if (hasSelection) {
        for (const objectId of requestedIds) {
          if (!inventory.files.some((file) => file.objectId === objectId)) {
            result.skipped.push({ message: '文件不存在。', objectId });
          }
        }
      }
      result.finishedAt = new Date().toISOString();
      const finishedAt = new Date(result.finishedAt);
      await this.persistHistory(
        ownerId,
        this.toHistoryItem(result, startedAt, finishedAt, deletedItems),
      );
      await this.recordRun(ownerId, source, finishedAt).catch((error) => {
        this.logger.error(
          '媒体清理结果已完成，但配置状态保存失败',
          error instanceof Error ? error.stack : String(error),
        );
      });
      return result;
    } catch (error) {
      const finishedAt = new Date();
      const failedMessage =
        error instanceof Error ? error.message : String(error);
      const failedResult: MediaCleanupRunResponse = {
        deletedBytes: 0,
        deletedFiles: 0,
        dryRun: input.dryRun === true,
        failed: [{ message: failedMessage, objectId: '*' }],
        finishedAt: finishedAt.toISOString(),
        skipped: [],
        source,
      };
      await this.persistHistory(
        ownerId,
        this.toHistoryItem(failedResult, startedAt, finishedAt, [], 'failed'),
      );
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async deleteFile(
    ownerId: string,
    file: MediaCleanupFileItem,
  ): Promise<void> {
    const sourcePath = this.resolveUploadPath(file.objectId);
    await mkdir(this.quarantineDir, { recursive: true });
    const quarantinePath = join(
      this.quarantineDir,
      `${file.objectId}.${Date.now()}.deleting`,
    );
    await rename(sourcePath, quarantinePath);
    try {
      if (!file.orphan) {
        const representative = file.relatedNotes[0];
        if (!representative) throw new Error('未找到媒体文件对应的笔记记录。');
        await this.noteHistoryService.confirmDeletedSourceObjects(
          representative.jobId,
          ownerId,
          [file.objectId],
        );
      }
    } catch (error) {
      await rename(quarantinePath, sourcePath).catch((restoreError) => {
        this.logger.error(
          `媒体文件回滚失败: ${file.objectId}`,
          restoreError instanceof Error
            ? restoreError.stack
            : String(restoreError),
        );
      });
      throw error;
    }
    await unlink(quarantinePath);
  }

  private resolveUploadPath(objectId: string): string {
    if (!objectId || basename(objectId) !== objectId) {
      throw new Error('媒体对象标识不安全，已拒绝清理。');
    }
    const absolutePath = resolve(this.uploadDir, objectId);
    if (dirname(absolutePath) !== resolve(this.uploadDir)) {
      throw new Error('媒体路径超出上传目录，已拒绝清理。');
    }
    return absolutePath;
  }

  private classifyFile(
    ownerId: string,
    objectId: string,
    absolutePath: string,
    fileSize: number,
    modifiedAt: Date,
    references: ObjectReference[],
    config: StoredMediaCleanupConfig,
  ): MediaCleanupFileItem {
    const ownerReferences = references.filter(
      (reference) => reference.record.ownerId === ownerId,
    );
    const otherOwnerReferences = references.filter(
      (reference) => reference.record.ownerId !== ownerId,
    );
    const relatedNotes: MediaCleanupRelatedNote[] = ownerReferences.map(
      ({ record }) => ({
        completedAt: record.completedAt?.toISOString() || null,
        jobId: record.jobId,
        sourceAssetGroupId: record.sourceAssetGroupId,
        startedAt: record.startedAt.toISOString(),
        status: record.status as ConversionStatus,
        title: record.title,
      }),
    );
    const inUse = ownerReferences.some(
      ({ record }) => record.status === 'processing',
    );
    const orphan = references.length === 0;
    const referenceTimes = ownerReferences.map(({ record }) =>
      (record.completedAt || record.startedAt).getTime(),
    );
    const lastReferencedAtMs =
      referenceTimes.length > 0 ? Math.max(...referenceTimes) : null;
    const ageAnchor = Math.max(modifiedAt.getTime(), lastReferencedAtMs || 0);
    const oldEnough =
      ageAnchor <= Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
    const allFailed =
      ownerReferences.length > 0 &&
      ownerReferences.every(({ record }) => record.status === 'failed');
    let eligible = false;
    let reason = '媒体文件仍在保留期内。';
    if (otherOwnerReferences.length > 0) {
      reason = '文件被其他账号引用，禁止清理。';
    } else if (inUse) {
      reason = '关联任务正在处理，禁止清理。';
    } else if (
      new Set(relatedNotes.map((note) => note.sourceAssetGroupId)).size > 1
    ) {
      reason = '文件被多个来源组引用，需逐条人工处理。';
    } else if (!oldEnough) {
      reason = `未达到 ${config.retentionDays} 天保留期。`;
    } else if (orphan && !config.deleteOrphanFiles) {
      reason = '孤儿文件自动清理未启用。';
    } else if (allFailed && !config.deleteFailedRecords) {
      reason = '失败任务媒体自动清理未启用。';
    } else {
      eligible = true;
      reason = orphan
        ? '无数据库引用且已超过保留期。'
        : '已超过保留期，可安全清理。';
    }
    const firstName = ownerReferences[0]?.fileName;
    return {
      absolutePath,
      eligible,
      fileName: firstName || objectId,
      fileSize,
      inUse,
      lastReferencedAt:
        lastReferencedAtMs === null
          ? null
          : new Date(lastReferencedAtMs).toISOString(),
      modifiedAt: modifiedAt.toISOString(),
      objectId,
      orphan,
      reason,
      relatedNotes,
    };
  }

  private async loadObjectReferences(): Promise<
    Map<string, ObjectReference[]>
  > {
    const rows: CleanupRecordRow[] = await this.db
      .select({
        completedAt: noteConversionRecords.completedAt,
        jobId: noteConversionRecords.jobId,
        ownerId: noteConversionRecords.ownerId,
        sourceAssetGroupId: noteConversionRecords.sourceAssetGroupId,
        sourceSnapshotJson: noteConversionRecords.sourceSnapshotJson,
        startedAt: noteConversionRecords.startedAt,
        status: noteConversionRecords.status,
        title: noteConversionRecords.title,
      })
      .from(noteConversionRecords);
    const references = new Map<string, ObjectReference[]>();
    for (const record of rows) {
      const source = parseRetainedNoteSource(record.sourceSnapshotJson);
      for (const media of this.listMedia(source)) {
        for (const object of media.objects) {
          const current = references.get(object.id) || [];
          current.push({ fileName: media.fileName, object, record });
          references.set(object.id, current);
        }
      }
    }
    return references;
  }

  private listMedia(
    source: RetainedNoteSource | null,
  ): RetainedUploadedMedia[] {
    if (!source || source.sourceType === 'platform') return [];
    if (source.sourceType === 'paired') {
      return [source.pairedMedia.video, source.pairedMedia.auxiliaryAudio];
    }
    return source.mediaItems;
  }

  private async pollSchedule(): Promise<void> {
    if (this.running) return;
    try {
      const config = await this.loadConfig();
      const now = new Date();
      if (!isMediaCleanupDue(config, now)) return;
      await this.runCleanup(config.ownerId, {}, 'scheduled');
    } catch (error) {
      this.logger.error(
        '定时媒体清理执行失败',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async recordRun(
    ownerId: string,
    source: MediaCleanupRunSource,
    finishedAt: Date,
  ): Promise<void> {
    const current = await this.loadConfig();
    const next: StoredMediaCleanupConfig = {
      ...current,
      lastRunAt: finishedAt.toISOString(),
      lastRunKey: getMediaCleanupRunKey(current.frequency, finishedAt),
      lastRunSource: source,
      ownerId,
    };
    await this.saveConfig(next);
  }

  private toHistoryItem(
    result: MediaCleanupRunResponse,
    startedAt: Date,
    finishedAt: Date,
    deletedItems: MediaCleanupDeletedItem[],
    status?: MediaCleanupRunStatus,
  ): MediaCleanupRunHistoryItem {
    const resolvedStatus: MediaCleanupRunStatus =
      status ||
      (result.failed.length === 0 && result.skipped.length === 0
        ? 'success'
        : result.deletedFiles > 0 || result.skipped.length > 0
          ? 'partial'
          : 'failed');
    return {
      deletedBytes: result.deletedBytes,
      deletedFiles: result.deletedFiles,
      deletedItems,
      dryRun: result.dryRun,
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      failed: result.failed,
      finishedAt: finishedAt.toISOString(),
      id: randomUUID(),
      skipped: result.skipped,
      source: result.source,
      startedAt: startedAt.toISOString(),
      status: resolvedStatus,
    };
  }

  private async persistHistory(
    ownerId: string,
    item: MediaCleanupRunHistoryItem,
  ): Promise<void> {
    try {
      const history = await this.loadHistory();
      const next: StoredMediaCleanupHistoryItem = { ...item, ownerId };
      await this.saveHistory(
        [next, ...history].slice(0, MAX_MEDIA_CLEANUP_HISTORY_ITEMS),
      );
    } catch (error) {
      this.logger.error(
        '媒体清理执行记录保存失败',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async loadHistory(): Promise<StoredMediaCleanupHistoryItem[]> {
    try {
      const raw = await readFile(this.historyPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!this.isHistoryFile(parsed)) {
        this.logger.warn('媒体清理执行记录格式无效，将忽略旧记录。');
        return [];
      }
      return parsed.items;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('媒体清理执行记录不可读，将使用空记录。');
      }
      return [];
    }
  }

  private async saveHistory(
    items: StoredMediaCleanupHistoryItem[],
  ): Promise<void> {
    const tempPath = `${this.historyPath}.${process.pid}.${Date.now()}.tmp`;
    const payload: StoredMediaCleanupHistoryFile = { items };
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.historyPath);
  }

  private isHistoryFile(
    value: unknown,
  ): value is StoredMediaCleanupHistoryFile {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { items?: unknown };
    return (
      Array.isArray(candidate.items) &&
      candidate.items.every((item: unknown) => this.isHistoryItem(item))
    );
  }

  private isHistoryItem(
    value: unknown,
  ): value is StoredMediaCleanupHistoryItem {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<StoredMediaCleanupHistoryItem>;
    return (
      typeof item.ownerId === 'string' &&
      typeof item.id === 'string' &&
      (item.source === 'manual' || item.source === 'scheduled') &&
      (item.status === 'success' ||
        item.status === 'partial' ||
        item.status === 'failed') &&
      typeof item.startedAt === 'string' &&
      typeof item.finishedAt === 'string' &&
      typeof item.durationMs === 'number' &&
      Number.isFinite(item.durationMs) &&
      typeof item.dryRun === 'boolean' &&
      typeof item.deletedBytes === 'number' &&
      Number.isFinite(item.deletedBytes) &&
      item.deletedBytes >= 0 &&
      typeof item.deletedFiles === 'number' &&
      Number.isInteger(item.deletedFiles) &&
      item.deletedFiles >= 0 &&
      Array.isArray(item.deletedItems) &&
      item.deletedItems.every((deletedItem: unknown) =>
        this.isDeletedItem(deletedItem),
      ) &&
      Array.isArray(item.failed) &&
      item.failed.every((entry: unknown) => this.isResultEntry(entry)) &&
      Array.isArray(item.skipped) &&
      item.skipped.every((entry: unknown) => this.isResultEntry(entry))
    );
  }

  private isDeletedItem(value: unknown): value is MediaCleanupDeletedItem {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<MediaCleanupDeletedItem>;
    return (
      typeof item.objectId === 'string' &&
      typeof item.fileName === 'string' &&
      typeof item.fileSize === 'number' &&
      Number.isFinite(item.fileSize) &&
      item.fileSize >= 0
    );
  }

  private isResultEntry(
    value: unknown,
  ): value is { message: string; objectId: string } {
    if (!value || typeof value !== 'object') return false;
    const item = value as { message?: unknown; objectId?: unknown };
    return (
      typeof item.objectId === 'string' && typeof item.message === 'string'
    );
  }

  private toPublicSettings(
    config: StoredMediaCleanupConfig,
  ): MediaCleanupSettings {
    return {
      deleteFailedRecords: config.deleteFailedRecords,
      deleteOrphanFiles: config.deleteOrphanFiles,
      enabled: config.enabled,
      frequency: config.frequency,
      lastRunAt: config.lastRunAt,
      lastRunSource: config.lastRunSource,
      monthlyDay: config.monthlyDay,
      nextRunAt: getNextMediaCleanupRunAt(config, new Date()),
      retentionDays: config.retentionDays,
      scheduledTime: config.scheduledTime,
      timezone: config.timezone,
      weeklyDay: config.weeklyDay,
    };
  }

  private async loadConfig(): Promise<StoredMediaCleanupConfig> {
    try {
      const raw = JSON.parse(
        await readFile(this.configPath, 'utf8'),
      ) as Partial<StoredMediaCleanupConfig>;
      const merged = { ...DEFAULT_MEDIA_CLEANUP_CONFIG, ...raw };
      const normalized = normalizeMediaCleanupSettings(merged);
      return {
        ...merged,
        ...normalized,
        lastRunAt:
          typeof merged.lastRunAt === 'string' ? merged.lastRunAt : null,
        lastRunKey:
          typeof merged.lastRunKey === 'string' ? merged.lastRunKey : null,
        lastRunSource:
          merged.lastRunSource === 'manual' ||
          merged.lastRunSource === 'scheduled'
            ? merged.lastRunSource
            : null,
        ownerId: typeof merged.ownerId === 'string' ? merged.ownerId : '',
        timezone: 'Asia/Shanghai',
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('媒体清理配置不可读，将使用安全默认值。');
      }
      return { ...DEFAULT_MEDIA_CLEANUP_CONFIG };
    }
  }

  private async saveConfig(config: StoredMediaCleanupConfig): Promise<void> {
    const tempPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.configPath);
  }
}
