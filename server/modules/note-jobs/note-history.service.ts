import { Inject, Injectable } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { desc, eq } from 'drizzle-orm';

import { noteConversionRecords } from '@server/database/schema';
import type {
  ConversionStatus,
  NoteConversionHistoryResponse,
  NoteConversionRecord,
  NoteJob,
  NoteSourceType,
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
  documentUrl: string | null;
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

  async list(ownerId: string): Promise<NoteConversionHistoryResponse> {
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
        documentUrl: noteConversionRecords.documentUrl,
      })
      .from(noteConversionRecords)
      .where(eq(noteConversionRecords.ownerId, ownerId))
      .orderBy(desc(noteConversionRecords.startedAt))
      .limit(100);

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
        documentUrl: row.documentUrl,
      }),
    );
    return { items };
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

  private toSourceType(value: string): NoteSourceType {
    if (
      value === 'video' ||
      value === 'audio' ||
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
}
