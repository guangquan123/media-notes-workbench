import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
} from '@lark-apaas/fullstack-nestjs-core';
import type { AppDatabase } from '@server/database/database.types';
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  max,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { noteConversionRecords } from '@server/database/schema';
import type {
  ConversionStatus,
  NoteConversionHistoryResponse,
  NoteConversionRecord,
  NoteJob,
  NoteRerunMode,
  NoteSourceSnapshotResponse,
  NoteSourceType,
  NoteStyle,
  NoteProcessingStatus,
  RetainedNoteSource,
  SummaryGenerationInfo,
  TaskSyncStatus,
} from '@shared/api.interface';
import {
  listRetainedSourceObjects,
  parseRetainedNoteSource,
  removeRetainedSourceObjects,
  summarizeRetainedNoteSource,
} from '@shared/note-reprocessing.utils';
import {
  calculateDurationMs,
  formatDuration,
  getConversionTypeLabel,
} from './note-history.utils';

interface FinishRecordInput {
  completedAt: Date;
  documentUrl?: string;
  error?: string;
  jobId: string;
  rawDocumentUrl?: string;
  startedAt: Date;
  status: Exclude<ConversionStatus, 'processing'>;
}

interface ConversionRecordRow {
  id: string;
  jobId: string;
  title: string;
  sourceType: string;
  sourceLabel: string;
  status: string;
  currentStage: string | null;
  progress: number | null;
  statusMessage: string | null;
  error: string | null;
  durationMs: number | null;
  startedAt: Date;
  completedAt: Date | null;
  rawDocumentUrl: string | null;
  rawTranscript: string | null;
  transcriptionModel: string | null;
  transcriptionProviderName: string | null;
  summaryGenerationJson: string | null;
  documentUrl: string | null;
  noteStyle: string | null;
  promptContent: string | null;
  promptVersionId: string | null;
  processingStatus: string;
  processedAt: Date | null;
  larkTaskGuid: string | null;
  larkTaskUrl: string | null;
  taskSyncStatus: string;
  taskSyncError: string | null;
  parentJobId: string | null;
  rerunMode: string;
  sourceDeletedAt: Date | null;
  sourceSnapshotJson: string | null;
  versionNumber: number;
}

interface ReviewTaskRow {
  larkTaskGuid: string | null;
  processingStatus: string;
  taskSyncStatus: string;
}

interface RawTranscriptRow {
  rawDocumentUrl: string | null;
  rawTranscript: string | null;
  sourceLabel: string;
  startedAt: Date;
  title: string;
}

export interface CreateHistoryRecordInput {
  parentJobId?: string;
  rawDocumentUrl?: string;
  rawTranscript?: string;
  rerunMode: NoteRerunMode;
  sourceAssetGroupId: string;
  sourceChannel?: 'feishu_inbox' | 'manual';
  sourceSnapshot: RetainedNoteSource | null;
  title?: string;
  versionNumber: number;
}

export interface ReprocessHistoryContext {
  jobId: string;
  noteStyle: NoteStyle;
  parentJobId: string | null;
  rawDocumentUrl: string | null;
  rawTranscript: string | null;
  rerunMode: NoteRerunMode;
  sourceAssetGroupId: string;
  sourceChannel: 'feishu_inbox' | 'manual';
  sourceDeletedAt: Date | null;
  sourceLabel: string;
  sourceSnapshot: RetainedNoteSource | null;
  sourceType: NoteSourceType;
  status: ConversionStatus;
  title: string;
  versionNumber: number;
}

interface HistoryListInput {
  jobId?: string;
  sourceChannel?: 'feishu_inbox' | 'manual';
  keyword?: string;
  page: number;
  pageSize: number;
  processingStatus?: NoteProcessingStatus;
  sourceType?: NoteSourceType;
  startedAtBefore?: Date;
  startedAtFrom?: Date;
  status?: ConversionStatus;
}

const INTERRUPTED_JOB_STATUS_MESSAGE =
  '服务重启导致处理任务中断，请重新提交';

function parseSummaryGeneration(
  value: string | null,
): SummaryGenerationInfo | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    const record: Record<string, unknown> = parsed as Record<string, unknown>;
    const stages: readonly SummaryGenerationInfo['stage'][] = [
      'preparing',
      'generating',
      'extracting',
      'structuring',
      'reviewing',
      'repairing',
      'completed',
      'fallback',
    ];
    if (
      typeof record.modelName !== 'string' ||
      (record.provider !== 'external_model' && record.provider !== 'builtin') ||
      typeof record.stage !== 'string' ||
      !stages.includes(record.stage as SummaryGenerationInfo['stage'])
    ) {
      return undefined;
    }
    const qualityWarnings: string[] | undefined = Array.isArray(
      record.qualityWarnings,
    )
      ? record.qualityWarnings.filter(
          (warning: unknown): warning is string => typeof warning === 'string',
        )
      : undefined;
    return {
      attempt:
        typeof record.attempt === 'number' ? record.attempt : undefined,
      modelName: record.modelName,
      provider: record.provider,
      qualityScore:
        typeof record.qualityScore === 'number'
          ? record.qualityScore
          : undefined,
      qualityWarnings,
      stage: record.stage as SummaryGenerationInfo['stage'],
    };
  } catch {
    return undefined;
  }
}

@Injectable()
export class NoteHistoryService {
  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: AppDatabase,
  ) {}

  async create(
    job: NoteJob,
    ownerId: string,
    input: CreateHistoryRecordInput,
  ): Promise<void> {
    const title: string =
      input.title ||
      job.mediaFileName ||
      `${job.sourceLabel}学习笔记`;
    await this.db.insert(noteConversionRecords).values({
      jobId: job.id,
      ownerId,
      parentJobId: input.parentJobId,
      rawDocumentUrl: input.rawDocumentUrl,
      rawTranscript: input.rawTranscript,
      rerunMode: input.rerunMode,
      sourceAssetGroupId: input.sourceAssetGroupId,
      sourceChannel: input.sourceChannel || 'manual',
      title,
      sourceType: job.sourceType,
      sourceLabel: getConversionTypeLabel(job.sourceType, job.sourcePlatform),
      sourceSnapshotJson: input.sourceSnapshot
        ? JSON.stringify(input.sourceSnapshot)
        : null,
      status: 'processing',
      startedAt: new Date(job.createdAt),
      versionNumber: input.versionNumber,
    });
  }

  async updateTitle(jobId: string, title: string): Promise<void> {
    await this.db
      .update(noteConversionRecords)
      .set({
        title: title.slice(0, 255),
      })
      .where(eq(noteConversionRecords.jobId, jobId));
  }

  async finish(input: FinishRecordInput): Promise<void> {
    const durationMs: number = calculateDurationMs(
      input.startedAt,
      input.completedAt,
    );
    await this.db
      .update(noteConversionRecords)
      .set({
        completedAt: input.completedAt,
        documentUrl: input.documentUrl,
        durationMs,
        error: input.error?.slice(0, 4000),
        rawDocumentUrl: input.rawDocumentUrl,
        status: input.status,
      })
      .where(eq(noteConversionRecords.jobId, input.jobId));
  }

  async finishExisting(
    jobId: string,
    ownerId: string,
    input: {
      documentUrl: string;
      rawDocumentUrl?: string;
      status: Exclude<ConversionStatus, 'processing'>;
    },
  ): Promise<void> {
    const rows = await this.db
      .select({ startedAt: noteConversionRecords.startedAt })
      .from(noteConversionRecords)
      .where(
        and(
          eq(noteConversionRecords.jobId, jobId),
          eq(noteConversionRecords.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('任务不存在');
    await this.finish({
      completedAt: new Date(),
      documentUrl: input.documentUrl,
      jobId,
      rawDocumentUrl: input.rawDocumentUrl,
      startedAt: rows[0].startedAt,
      status: input.status,
    });
  }

  async failInterrupted(
    jobId: string,
    ownerId: string,
    error: string,
  ): Promise<void> {
    const rows = await this.db
      .select({ startedAt: noteConversionRecords.startedAt })
      .from(noteConversionRecords)
      .where(
        and(
          eq(noteConversionRecords.jobId, jobId),
          eq(noteConversionRecords.ownerId, ownerId),
          eq(noteConversionRecords.status, 'processing'),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return;
    const completedAt = new Date();
    await this.db
      .update(noteConversionRecords)
      .set({
        completedAt,
        currentStage: 'failed',
        durationMs: calculateDurationMs(row.startedAt, completedAt),
        error: error.slice(0, 4000),
        status: 'failed',
        statusMessage: INTERRUPTED_JOB_STATUS_MESSAGE,
      })
      .where(
        and(
          eq(noteConversionRecords.jobId, jobId),
          eq(noteConversionRecords.ownerId, ownerId),
          eq(noteConversionRecords.status, 'processing'),
        ),
      );
  }

  async failAllInterrupted(error: string): Promise<string[]> {
    const completedAt = new Date();
    const completedAtIso = completedAt.toISOString();
    const rows = await this.db
      .update(noteConversionRecords)
      .set({
        completedAt,
        currentStage: 'failed',
        durationMs: sql<number>`least(
          2147483647,
          greatest(
            0,
            floor(
              extract(
                epoch from ${completedAtIso}::timestamptz - ${noteConversionRecords.startedAt}
              ) * 1000
            )
          )
        )::integer`,
        error: error.slice(0, 4000),
        status: 'failed',
        statusMessage: INTERRUPTED_JOB_STATUS_MESSAGE,
      })
      .where(
        and(
          eq(noteConversionRecords.status, 'processing'),
          or(
            isNull(noteConversionRecords.currentStage),
            ne(noteConversionRecords.currentStage, 'awaiting-frame-review'),
          ),
        ),
      )
      .returning({ jobId: noteConversionRecords.jobId });
    return rows.map((row: { jobId: string }): string => row.jobId);
  }

  async list(
    ownerId: string,
    input: HistoryListInput,
  ): Promise<NoteConversionHistoryResponse> {
    const conditions: SQL<unknown>[] = [
      eq(noteConversionRecords.ownerId, ownerId),
    ];
    if (input.keyword) {
      const keywordPattern: string = input.keyword.replace(/[\\%_]/gu, '\\$&');
      conditions.push(
        ilike(noteConversionRecords.title, `%${keywordPattern}%`),
      );
    }
    if (input.jobId)
      conditions.push(eq(noteConversionRecords.jobId, input.jobId));
    if (input.sourceChannel)
      conditions.push(
        eq(noteConversionRecords.sourceChannel, input.sourceChannel),
      );
    if (input.processingStatus) {
      conditions.push(
        eq(noteConversionRecords.processingStatus, input.processingStatus),
      );
    }
    if (input.sourceType) {
      conditions.push(eq(noteConversionRecords.sourceType, input.sourceType));
    }
    if (input.status) {
      conditions.push(eq(noteConversionRecords.status, input.status));
    }
    if (input.startedAtFrom) {
      conditions.push(
        gte(noteConversionRecords.startedAt, input.startedAtFrom),
      );
    }
    if (input.startedAtBefore) {
      conditions.push(
        lt(noteConversionRecords.startedAt, input.startedAtBefore),
      );
    }
    const whereClause = and(...conditions);
    const countRows: Array<{ total: number }> = await this.db
      .select({ total: count() })
      .from(noteConversionRecords)
      .where(whereClause);
    const totalItems: number = Number(countRows[0]?.total || 0);
    const offset: number = (input.page - 1) * input.pageSize;
    const rows: ConversionRecordRow[] = await this.db
      .select({
        id: noteConversionRecords.id,
        jobId: noteConversionRecords.jobId,
        title: noteConversionRecords.title,
        sourceType: noteConversionRecords.sourceType,
        sourceLabel: noteConversionRecords.sourceLabel,
        status: noteConversionRecords.status,
        currentStage: noteConversionRecords.currentStage,
        progress: noteConversionRecords.progress,
        statusMessage: noteConversionRecords.statusMessage,
        error: noteConversionRecords.error,
        durationMs: noteConversionRecords.durationMs,
        startedAt: noteConversionRecords.startedAt,
        completedAt: noteConversionRecords.completedAt,
        rawDocumentUrl: noteConversionRecords.rawDocumentUrl,
        rawTranscript: noteConversionRecords.rawTranscript,
        transcriptionModel: noteConversionRecords.transcriptionModel,
        transcriptionProviderName:
          noteConversionRecords.transcriptionProviderName,
        summaryGenerationJson: noteConversionRecords.summaryGenerationJson,
        documentUrl: noteConversionRecords.documentUrl,
        noteStyle: noteConversionRecords.noteStyle,
        promptContent: noteConversionRecords.promptContent,
        promptVersionId: noteConversionRecords.promptVersionId,
        processingStatus: noteConversionRecords.processingStatus,
        processedAt: noteConversionRecords.processedAt,
        larkTaskGuid: noteConversionRecords.larkTaskGuid,
        larkTaskUrl: noteConversionRecords.larkTaskUrl,
        taskSyncStatus: noteConversionRecords.taskSyncStatus,
        taskSyncError: noteConversionRecords.taskSyncError,
        parentJobId: noteConversionRecords.parentJobId,
        rerunMode: noteConversionRecords.rerunMode,
        sourceDeletedAt: noteConversionRecords.sourceDeletedAt,
        sourceSnapshotJson: noteConversionRecords.sourceSnapshotJson,
        versionNumber: noteConversionRecords.versionNumber,
      })
      .from(noteConversionRecords)
      .where(whereClause)
      .orderBy(desc(noteConversionRecords.startedAt))
      .limit(input.pageSize)
      .offset(offset);

    const items: NoteConversionRecord[] = rows.map(
      (row: ConversionRecordRow): NoteConversionRecord => {
        const source: RetainedNoteSource | null = parseRetainedNoteSource(
          row.sourceSnapshotJson,
        );
        return {
          id: row.id,
          jobId: row.jobId,
          title: row.title,
          sourceType: this.toSourceType(row.sourceType),
          sourceLabel: row.sourceLabel,
          status: this.toStatus(row.status),
          currentStage: this.toJobStage(row.currentStage),
          progress: row.progress ?? undefined,
          statusMessage: row.statusMessage,
          error: row.error,
          durationMs: row.durationMs,
          durationLabel: formatDuration(row.durationMs),
          startedAt: row.startedAt.toISOString(),
          completedAt: row.completedAt?.toISOString() || null,
          rawDocumentUrl: row.rawDocumentUrl,
          rawTranscriptAvailable: Boolean(row.rawTranscript?.trim()),
          transcriptionModel: row.transcriptionModel,
          transcriptionProviderName: row.transcriptionProviderName,
          summaryGeneration: parseSummaryGeneration(row.summaryGenerationJson),
          documentUrl: row.documentUrl,
          noteStyle: this.toNoteStyle(row.noteStyle),
          promptContent: row.promptContent,
          promptVersionId: row.promptVersionId,
          processingStatus: this.toProcessingStatus(row.processingStatus),
          processedAt: row.processedAt?.toISOString() || null,
          larkTaskGuid: row.larkTaskGuid,
          larkTaskUrl: row.larkTaskUrl,
          taskSyncStatus: this.toTaskSyncStatus(row.taskSyncStatus),
          taskSyncError: row.taskSyncError,
          parentJobId: row.parentJobId,
          rerunMode: this.toRerunMode(row.rerunMode),
          sourceAssets: summarizeRetainedNoteSource(
            source,
            row.sourceDeletedAt?.toISOString() || null,
          ),
          visualOptions: source?.visualOptions,
          versionNumber: row.versionNumber,
        };
      },
    );
    return {
      items,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / input.pageSize),
      },
    };
  }

  async updateRawDocumentUrl(
    jobId: string,
    rawDocumentUrl: string,
  ): Promise<void> {
    await this.db
      .update(noteConversionRecords)
      .set({
        rawDocumentUrl,
      })
      .where(eq(noteConversionRecords.jobId, jobId));
  }

  async updateRawTranscript(jobId: string, transcript: string): Promise<void> {
    await this.db
      .update(noteConversionRecords)
      .set({ rawTranscript: transcript })
      .where(eq(noteConversionRecords.jobId, jobId));
  }

  async getReprocessContext(
    jobId: string,
    ownerId: string,
  ): Promise<ReprocessHistoryContext> {
    const rows = await this.db
      .select({
        jobId: noteConversionRecords.jobId,
        noteStyle: noteConversionRecords.noteStyle,
        parentJobId: noteConversionRecords.parentJobId,
        rawDocumentUrl: noteConversionRecords.rawDocumentUrl,
        rawTranscript: noteConversionRecords.rawTranscript,
        rerunMode: noteConversionRecords.rerunMode,
        sourceAssetGroupId: noteConversionRecords.sourceAssetGroupId,
        sourceChannel: noteConversionRecords.sourceChannel,
        sourceDeletedAt: noteConversionRecords.sourceDeletedAt,
        sourceLabel: noteConversionRecords.sourceLabel,
        sourceSnapshotJson: noteConversionRecords.sourceSnapshotJson,
        sourceType: noteConversionRecords.sourceType,
        status: noteConversionRecords.status,
        title: noteConversionRecords.title,
        versionNumber: noteConversionRecords.versionNumber,
      })
      .from(noteConversionRecords)
      .where(
        and(
          eq(noteConversionRecords.jobId, jobId),
          eq(noteConversionRecords.ownerId, ownerId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException('未找到对应的转化记录');
    return {
      jobId: row.jobId,
      noteStyle: this.toNoteStyle(row.noteStyle) || 'learning',
      parentJobId: row.parentJobId,
      rawDocumentUrl: row.rawDocumentUrl,
      rawTranscript: row.rawTranscript,
      rerunMode: this.toRerunMode(row.rerunMode),
      sourceAssetGroupId: row.sourceAssetGroupId,
      sourceChannel:
        row.sourceChannel === 'feishu_inbox' ? 'feishu_inbox' : 'manual',
      sourceDeletedAt: row.sourceDeletedAt,
      sourceLabel: row.sourceLabel,
      sourceSnapshot: parseRetainedNoteSource(row.sourceSnapshotJson),
      sourceType: this.toSourceType(row.sourceType),
      status: this.toStatus(row.status),
      title: row.title,
      versionNumber: row.versionNumber,
    };
  }

  async getSourceSnapshot(
    jobId: string,
    ownerId: string,
  ): Promise<NoteSourceSnapshotResponse> {
    const context: ReprocessHistoryContext = await this.getReprocessContext(
      jobId,
      ownerId,
    );
    return {
      inUse: await this.hasProcessingVersion(
        context.sourceAssetGroupId,
        ownerId,
      ),
      source: context.sourceSnapshot,
      summary: summarizeRetainedNoteSource(
        context.sourceSnapshot,
        context.sourceDeletedAt?.toISOString() || null,
      ),
    };
  }

  async confirmDeletedSourceObjects(
    jobId: string,
    ownerId: string,
    objectIds: readonly string[],
  ): Promise<NoteSourceSnapshotResponse> {
    const context: ReprocessHistoryContext = await this.getReprocessContext(
      jobId,
      ownerId,
    );
    const currentIds: ReadonlySet<string> = new Set(
      listRetainedSourceObjects(context.sourceSnapshot).map(
        (object): string => object.id,
      ),
    );
    const confirmedIds: string[] = objectIds.filter(
      (objectId: string): boolean => currentIds.has(objectId),
    );
    if (confirmedIds.length === 0) {
      return this.getSourceSnapshot(jobId, ownerId);
    }
    const nextSource: RetainedNoteSource | null = removeRetainedSourceObjects(
      context.sourceSnapshot,
      confirmedIds,
    );
    const deletedAt: Date | null = nextSource ? null : new Date();
    await this.db
      .update(noteConversionRecords)
      .set({
        sourceDeletedAt: deletedAt,
        sourceSnapshotJson: nextSource ? JSON.stringify(nextSource) : null,
      })
      .where(
        and(
          eq(noteConversionRecords.ownerId, ownerId),
          eq(
            noteConversionRecords.sourceAssetGroupId,
            context.sourceAssetGroupId,
          ),
        ),
      );
    return {
      inUse: await this.hasProcessingVersion(
        context.sourceAssetGroupId,
        ownerId,
      ),
      source: nextSource,
      summary: summarizeRetainedNoteSource(
        nextSource,
        deletedAt?.toISOString() || null,
      ),
    };
  }

  async getNextVersionNumber(
    sourceAssetGroupId: string,
    ownerId: string,
  ): Promise<number> {
    const rows: Array<{ versionNumber: number | null }> = await this.db
      .select({ versionNumber: max(noteConversionRecords.versionNumber) })
      .from(noteConversionRecords)
      .where(
        and(
          eq(noteConversionRecords.ownerId, ownerId),
          eq(noteConversionRecords.sourceAssetGroupId, sourceAssetGroupId),
        ),
      );
    return (rows[0]?.versionNumber || 0) + 1;
  }

  async hasProcessingVersion(
    sourceAssetGroupId: string,
    ownerId: string,
  ): Promise<boolean> {
    const rows: Array<{ total: number }> = await this.db
      .select({ total: count() })
      .from(noteConversionRecords)
      .where(
        and(
          eq(noteConversionRecords.ownerId, ownerId),
          eq(noteConversionRecords.sourceAssetGroupId, sourceAssetGroupId),
          eq(noteConversionRecords.status, 'processing'),
        ),
      );
    return Number(rows[0]?.total || 0) > 0;
  }

  async updatePromptSnapshot(
    jobId: string,
    noteStyle: NoteStyle,
    promptContent: string,
    promptVersionId: string | null,
  ): Promise<void> {
    await this.db
      .update(noteConversionRecords)
      .set({ noteStyle, promptContent, promptVersionId })
      .where(eq(noteConversionRecords.jobId, jobId));
  }

  async updateReviewTask(
    jobId: string,
    task: { guid: string; url: string | null },
  ): Promise<void> {
    await this.db
      .update(noteConversionRecords)
      .set({
        larkTaskGuid: task.guid,
        larkTaskUrl: task.url,
        taskSyncError: null,
        taskSyncStatus: 'created',
      })
      .where(eq(noteConversionRecords.jobId, jobId));
  }

  async updateReviewTaskFailure(jobId: string, error: string): Promise<void> {
    await this.db
      .update(noteConversionRecords)
      .set({
        taskSyncError: error.slice(0, 4000),
        taskSyncStatus: 'failed',
      })
      .where(eq(noteConversionRecords.jobId, jobId));
  }

  async getReviewTask(jobId: string, ownerId: string): Promise<ReviewTaskRow> {
    const rows: ReviewTaskRow[] = await this.db
      .select({
        larkTaskGuid: noteConversionRecords.larkTaskGuid,
        processingStatus: noteConversionRecords.processingStatus,
        taskSyncStatus: noteConversionRecords.taskSyncStatus,
      })
      .from(noteConversionRecords)
      .where(
        and(
          eq(noteConversionRecords.jobId, jobId),
          eq(noteConversionRecords.ownerId, ownerId),
        ),
      )
      .limit(1);
    const record: ReviewTaskRow | undefined = rows[0];
    if (!record) throw new NotFoundException('未找到对应的转化记录');
    return record;
  }

  async markProcessed(jobId: string, ownerId: string): Promise<void> {
    await this.db
      .update(noteConversionRecords)
      .set({ processingStatus: 'processed', processedAt: new Date() })
      .where(
        and(
          eq(noteConversionRecords.jobId, jobId),
          eq(noteConversionRecords.ownerId, ownerId),
        ),
      );
  }

  async getRawTranscript(
    jobId: string,
    ownerId: string,
  ): Promise<RawTranscriptRow> {
    const rows: RawTranscriptRow[] = await this.db
      .select({
        rawDocumentUrl: noteConversionRecords.rawDocumentUrl,
        rawTranscript: noteConversionRecords.rawTranscript,
        sourceLabel: noteConversionRecords.sourceLabel,
        startedAt: noteConversionRecords.startedAt,
        title: noteConversionRecords.title,
      })
      .from(noteConversionRecords)
      .where(
        and(
          eq(noteConversionRecords.jobId, jobId),
          eq(noteConversionRecords.ownerId, ownerId),
        ),
      )
      .limit(1);
    const record: RawTranscriptRow | undefined = rows[0];
    if (!record?.rawTranscript?.trim()) {
      throw new NotFoundException('该历史记录没有可下载的原文内容');
    }
    return record;
  }

  private toSourceType(value: string): NoteSourceType {
    if (
      value === 'video' ||
      value === 'audio' ||
      value === 'paired' ||
      value === 'document' ||
      value === 'pdf'
    ) {
      return value;
    }
    return 'platform';
  }

  private toStatus(value: string): ConversionStatus {
    if (value === 'completed' || value === 'failed') return value;
    return 'processing';
  }

  private toJobStage(value: string | null): NoteConversionRecord['currentStage'] {
    const stages = [
      'queued',
      'uploading',
      'checking',
      'preparing',
      'parsing',
      'downloading',
      'aligning',
      'transcribing',
      'extracting-frames',
      'uploading-frames',
      'analyzing-frames',
      'awaiting-frame-review',
      'summarizing',
      'publishing',
      'completed',
      'cancelled',
      'failed',
    ] as const;
    return stages.includes(value as (typeof stages)[number])
      ? (value as NoteConversionRecord['currentStage'])
      : undefined;
  }

  private toNoteStyle(value: string | null): NoteStyle | null {
    if (value === 'learning' || value === 'meeting') return value;
    return null;
  }

  private toProcessingStatus(value: string): NoteProcessingStatus {
    return value === 'processed' ? 'processed' : 'pending';
  }

  private toTaskSyncStatus(value: string): TaskSyncStatus {
    if (value === 'created' || value === 'failed') return value;
    return 'not_created';
  }

  private toRerunMode(value: string): NoteRerunMode {
    if (value === 'regenerate_note' || value === 'full_reprocess') return value;
    return 'initial';
  }
}
