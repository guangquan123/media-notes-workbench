import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, count, desc, eq, gte, ilike, lt, type SQL } from 'drizzle-orm';

import { noteConversionRecords } from '@server/database/schema';
import type {
  ConversionStatus,
  NoteConversionHistoryResponse,
  NoteConversionRecord,
  NoteJob,
  NoteSourceType,
  NoteStyle,
  NoteProcessingStatus,
  TaskSyncStatus,
} from '@shared/api.interface';
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
  durationMs: number | null;
  startedAt: Date;
  completedAt: Date | null;
  rawDocumentUrl: string | null;
  rawTranscript: string | null;
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

@Injectable()
export class NoteHistoryService {
  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
  ) {}

  async create(job: NoteJob, ownerId: string): Promise<void> {
    const title: string = job.mediaFileName || `${job.sourceLabel}学习笔记`;
    await this.db.insert(noteConversionRecords).values({
      jobId: job.id,
      ownerId,
      title,
      sourceType: job.sourceType,
      sourceLabel: getConversionTypeLabel(job.sourceType, job.sourcePlatform),
      status: 'processing',
      startedAt: new Date(job.createdAt),
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
    if (input.jobId) conditions.push(eq(noteConversionRecords.jobId, input.jobId));
    if (input.sourceChannel) conditions.push(eq(noteConversionRecords.sourceChannel, input.sourceChannel));
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
        durationMs: noteConversionRecords.durationMs,
        startedAt: noteConversionRecords.startedAt,
        completedAt: noteConversionRecords.completedAt,
        rawDocumentUrl: noteConversionRecords.rawDocumentUrl,
        rawTranscript: noteConversionRecords.rawTranscript,
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
      })
      .from(noteConversionRecords)
      .where(whereClause)
      .orderBy(desc(noteConversionRecords.startedAt))
      .limit(input.pageSize)
      .offset(offset);

    const items: NoteConversionRecord[] = rows.map(
      (row: ConversionRecordRow): NoteConversionRecord => ({
        id: row.id,
        jobId: row.jobId,
        title: row.title,
        sourceType: this.toSourceType(row.sourceType),
        sourceLabel: row.sourceLabel,
        status: this.toStatus(row.status),
        durationMs: row.durationMs,
        durationLabel: formatDuration(row.durationMs),
        startedAt: row.startedAt.toISOString(),
        completedAt: row.completedAt?.toISOString() || null,
        rawDocumentUrl: row.rawDocumentUrl,
        rawTranscriptAvailable: Boolean(row.rawTranscript?.trim()),
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
      }),
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
}
