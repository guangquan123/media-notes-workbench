import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { noteConversionRecords, noteJobFrames } from '@server/database/schema';
import type {
  JobStage,
  NoteJob,
  NoteJobFrame,
  NoteJobFrameListResponse,
  NoteVisualOptions,
  UpdateFrameSelectionRequest,
  UpdateFrameSelectionResponse,
  VisualPipelineSummary,
} from '@shared/api.interface';
import type { KeyFrame } from './frame-extraction.service';
import { validateFrameSelectionRequest } from './frame-selection.utils';

interface PersistedVisualJob {
  currentStage: string | null;
  draftMarkdown: string | null;
  frameSelectionRevision: number;
  visualOptions: NoteVisualOptions;
}

@Injectable()
export class FrameReviewService {
  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
  ) {}

  async saveCandidates(
    jobId: string,
    ownerId: string,
    frames: readonly KeyFrame[],
    selectedBy: 'automatic' | 'user' = 'automatic',
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        await transaction
          .insert(noteJobFrames)
          .values({
            analysisJson: frame.analysis
              ? JSON.stringify(frame.analysis)
              : null,
            derivativeAssetRef: frame.derivativeUrl || null,
            derivativeStatus: frame.derivativeUrl
              ? 'completed'
              : 'not_requested',
            displayOrder: index,
            extractionType: frame.type,
            globalTimestampMs: Math.round(
              (frame.globalTimestamp ?? frame.timestamp) * 1_000,
            ),
            jobId,
            originalAssetRef: JSON.stringify({
              imageKey: frame.imageKey || null,
              previewDataUrl: frame.previewDataUrl || null,
            }),
            ownerId,
            perceptualHash: frame.perceptualHash || null,
            scoresJson: JSON.stringify({
              scene: frame.sceneScore ?? 0,
              selection: frame.selectionScore ?? 0,
              uniqueness: frame.uniquenessScore ?? 0,
              visualInformation: frame.visualInformationScore ?? 0,
            }),
            selectedBy,
            selectionStatus: 'selected',
            sourceFileName: frame.sourceFileName.slice(0, 255),
            sourceIndex: frame.sourceIndex,
            timestampMs: Math.round(frame.timestamp * 1_000),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              noteJobFrames.jobId,
              noteJobFrames.sourceIndex,
              noteJobFrames.timestampMs,
              noteJobFrames.extractionType,
            ],
            set: {
              analysisJson: frame.analysis
                ? JSON.stringify(frame.analysis)
                : null,
              derivativeAssetRef: frame.derivativeUrl || null,
              derivativeStatus: frame.derivativeUrl
                ? 'completed'
                : 'not_requested',
              displayOrder: index,
              originalAssetRef: JSON.stringify({
                imageKey: frame.imageKey || null,
                previewDataUrl: frame.previewDataUrl || null,
              }),
              perceptualHash: frame.perceptualHash || null,
              scoresJson: JSON.stringify({
                scene: frame.sceneScore ?? 0,
                selection: frame.selectionScore ?? 0,
                uniqueness: frame.uniquenessScore ?? 0,
                visualInformation: frame.visualInformationScore ?? 0,
              }),
              selectedBy,
              selectionStatus: 'selected',
              updatedAt: new Date(),
            },
          });
      }
    });
  }

  async saveJobState(
    jobId: string,
    input: {
      draftMarkdown?: string | null;
      job?: Pick<NoteJob, 'message' | 'progress' | 'stage'>;
      options?: NoteVisualOptions;
      summary?: VisualPipelineSummary;
    },
  ): Promise<void> {
    await this.db
      .update(noteConversionRecords)
      .set({
        currentStage: input.job?.stage,
        draftMarkdown: input.draftMarkdown,
        progress: input.job?.progress,
        statusMessage: input.job?.message,
        visualOptionsJson: input.options
          ? JSON.stringify(input.options)
          : undefined,
        visualSummaryJson: input.summary
          ? JSON.stringify(input.summary)
          : undefined,
      })
      .where(eq(noteConversionRecords.jobId, jobId));
  }

  async list(
    jobId: string,
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<NoteJobFrameListResponse> {
    const record = await this.requireOwnedJob(jobId, ownerId);
    const rows = await this.db
      .select()
      .from(noteJobFrames)
      .where(
        and(eq(noteJobFrames.jobId, jobId), eq(noteJobFrames.ownerId, ownerId)),
      )
      .orderBy(asc(noteJobFrames.globalTimestampMs), asc(noteJobFrames.id));
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(1_000, pageSize));
    const offset = (safePage - 1) * safePageSize;
    return {
      items: rows
        .slice(offset, offset + safePageSize)
        .map((row): NoteJobFrame => this.toApiFrame(row)),
      page: safePage,
      pageSize: safePageSize,
      revision: record.frameSelectionRevision,
      totalItems: rows.length,
    };
  }

  async updateSelection(
    jobId: string,
    ownerId: string,
    input: UpdateFrameSelectionRequest,
  ): Promise<UpdateFrameSelectionResponse> {
    validateFrameSelectionRequest(input);
    const selectedIds = [...new Set(input.selectedFrameIds)];
    const orderedIds = [...new Set(input.orderedFrameIds)];
    if (
      orderedIds.length !== selectedIds.length ||
      orderedIds.some((id) => !selectedIds.includes(id))
    ) {
      throw new BadRequestException('排序列表必须与已选关键帧完全一致');
    }
    const record = await this.requireOwnedJob(jobId, ownerId);
    if (record.currentStage !== 'awaiting-frame-review') {
      throw new BadRequestException('当前任务不处于关键画面确认阶段');
    }
    if (record.frameSelectionRevision !== input.revision) {
      throw new ConflictException('关键帧选择已被更新，请刷新后重试');
    }
    const ownedRows =
      selectedIds.length === 0
        ? []
        : await this.db
            .select({ id: noteJobFrames.id })
            .from(noteJobFrames)
            .where(
              and(
                eq(noteJobFrames.jobId, jobId),
                eq(noteJobFrames.ownerId, ownerId),
                inArray(noteJobFrames.id, selectedIds),
              ),
            );
    if (ownedRows.length !== selectedIds.length) {
      throw new BadRequestException('选择中包含不存在的关键帧');
    }

    await this.db.transaction(async (transaction) => {
      await transaction
        .update(noteJobFrames)
        .set({
          displayOrder: null,
          selectedBy: 'user',
          selectionStatus: 'rejected',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(noteJobFrames.jobId, jobId),
            eq(noteJobFrames.ownerId, ownerId),
          ),
        );
      for (let index = 0; index < orderedIds.length; index += 1) {
        await transaction
          .update(noteJobFrames)
          .set({
            displayOrder: index,
            selectedBy: 'user',
            selectionStatus: 'selected',
            updatedAt: new Date(),
          })
          .where(eq(noteJobFrames.id, orderedIds[index]));
      }
      const updated = await transaction
        .update(noteConversionRecords)
        .set({ frameSelectionRevision: input.revision + 1 })
        .where(
          and(
            eq(noteConversionRecords.jobId, jobId),
            eq(noteConversionRecords.ownerId, ownerId),
            eq(noteConversionRecords.frameSelectionRevision, input.revision),
          ),
        )
        .returning({ revision: noteConversionRecords.frameSelectionRevision });
      if (!updated[0]) throw new ConflictException('关键帧选择版本冲突');
    });
    return {
      revision: input.revision + 1,
      selectedFrameIds: orderedIds,
    };
  }

  async getSelectedFrames(jobId: string, ownerId: string): Promise<KeyFrame[]> {
    await this.requireOwnedJob(jobId, ownerId);
    const rows = await this.db
      .select()
      .from(noteJobFrames)
      .where(
        and(
          eq(noteJobFrames.jobId, jobId),
          eq(noteJobFrames.ownerId, ownerId),
          eq(noteJobFrames.selectionStatus, 'selected'),
        ),
      )
      .orderBy(
        asc(noteJobFrames.displayOrder),
        asc(noteJobFrames.globalTimestampMs),
      );
    return rows.map((row) => ({
      analysis: parseJson(row.analysisJson),
      derivativeUrl: row.derivativeAssetRef || undefined,
      filePath: '',
      globalTimestamp: row.globalTimestampMs / 1_000,
      id: row.id,
      imageKey: parseAssetRef(row.originalAssetRef).imageKey || undefined,
      perceptualHash: row.perceptualHash || undefined,
      previewDataUrl:
        parseAssetRef(row.originalAssetRef).previewDataUrl || undefined,
      selectionScore: Number(
        parseJson<Record<string, number>>(row.scoresJson)?.selection || 0,
      ),
      sourceFileName: row.sourceFileName,
      sourceIndex: row.sourceIndex,
      timestamp: row.timestampMs / 1_000,
      type: row.extractionType === 'scene' ? 'scene' : 'interval',
    }));
  }

  async getPersistedVisualJob(
    jobId: string,
    ownerId: string,
  ): Promise<PersistedVisualJob> {
    const row = await this.requireOwnedJob(jobId, ownerId);
    return {
      currentStage: row.currentStage,
      draftMarkdown: row.draftMarkdown,
      frameSelectionRevision: row.frameSelectionRevision,
      visualOptions: parseJson<NoteVisualOptions>(row.visualOptionsJson) || {
        mode: 'disabled',
      },
    };
  }

  async getJobSnapshot(jobId: string, ownerId: string): Promise<NoteJob> {
    const rows = await this.db
      .select({
        createdAt: noteConversionRecords.startedAt,
        currentStage: noteConversionRecords.currentStage,
        documentUrl: noteConversionRecords.documentUrl,
        error: noteConversionRecords.error,
        progress: noteConversionRecords.progress,
        rawDocumentUrl: noteConversionRecords.rawDocumentUrl,
        sourceLabel: noteConversionRecords.sourceLabel,
        sourceType: noteConversionRecords.sourceType,
        status: noteConversionRecords.status,
        statusMessage: noteConversionRecords.statusMessage,
        title: noteConversionRecords.title,
        updatedAt: noteConversionRecords.updatedAt,
        visualOptionsJson: noteConversionRecords.visualOptionsJson,
        visualSummaryJson: noteConversionRecords.visualSummaryJson,
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
    if (!row) throw new NotFoundException('任务不存在');
    const stage: JobStage =
      row.status === 'completed'
        ? 'completed'
        : row.status === 'failed'
          ? 'failed'
          : toJobStage(row.currentStage);
    return {
      createdAt: row.createdAt.toISOString(),
      documentUrl: row.documentUrl || undefined,
      error: row.error || undefined,
      id: jobId,
      message:
        row.statusMessage || (stage === 'completed' ? '已完成' : '处理中'),
      progress: row.progress ?? (stage === 'completed' ? 100 : 0),
      rawDocumentUrl: row.rawDocumentUrl || undefined,
      sourceLabel: row.sourceLabel,
      sourceType: toSourceType(row.sourceType),
      stage,
      updatedAt: row.updatedAt.toISOString(),
      videoTitle: row.title,
      visualOptions: parseJson(row.visualOptionsJson),
      visualSummary: parseJson(row.visualSummaryJson),
    };
  }

  async updateDerivative(
    jobId: string,
    ownerId: string,
    frameId: string,
    derivativeUrl: string,
    analysis: KeyFrame['analysis'],
  ): Promise<void> {
    await this.requireOwnedJob(jobId, ownerId);
    const updated = await this.db
      .update(noteJobFrames)
      .set({
        analysisJson: analysis ? JSON.stringify(analysis) : undefined,
        derivativeAssetRef: derivativeUrl,
        derivativeStatus: 'completed',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(noteJobFrames.id, frameId),
          eq(noteJobFrames.jobId, jobId),
          eq(noteJobFrames.ownerId, ownerId),
        ),
      )
      .returning({ id: noteJobFrames.id });
    if (!updated[0]) throw new NotFoundException('关键帧不存在');
  }

  private async requireOwnedJob(jobId: string, ownerId: string) {
    const rows = await this.db
      .select({
        currentStage: noteConversionRecords.currentStage,
        draftMarkdown: noteConversionRecords.draftMarkdown,
        frameSelectionRevision: noteConversionRecords.frameSelectionRevision,
        visualOptionsJson: noteConversionRecords.visualOptionsJson,
      })
      .from(noteConversionRecords)
      .where(
        and(
          eq(noteConversionRecords.jobId, jobId),
          eq(noteConversionRecords.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('任务不存在');
    return rows[0];
  }

  private toApiFrame(row: typeof noteJobFrames.$inferSelect): NoteJobFrame {
    const scores = parseJson<Record<string, number>>(row.scoresJson);
    return {
      analysis: parseJson(row.analysisJson),
      derivativeStatus:
        row.derivativeStatus === 'processing' ||
        row.derivativeStatus === 'completed' ||
        row.derivativeStatus === 'failed'
          ? row.derivativeStatus
          : 'not_requested',
      derivativeUrl: row.derivativeAssetRef || undefined,
      displayOrder: row.displayOrder,
      extractionType: row.extractionType === 'scene' ? 'scene' : 'interval',
      globalTimestampMs: row.globalTimestampMs,
      id: row.id,
      originalUrl: parseAssetRef(row.originalAssetRef).previewDataUrl || '',
      score: Number(scores?.selection || 0),
      selectionStatus:
        row.selectionStatus === 'selected' || row.selectionStatus === 'rejected'
          ? row.selectionStatus
          : 'candidate',
      sourceFileName: row.sourceFileName,
      sourceIndex: row.sourceIndex,
      timestampMs: row.timestampMs,
    };
  }
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function parseAssetRef(value: string | null): {
  imageKey: string | null;
  previewDataUrl: string | null;
} {
  if (!value) return { imageKey: null, previewDataUrl: null };
  try {
    const parsed = JSON.parse(value) as {
      imageKey?: string | null;
      previewDataUrl?: string | null;
    };
    return {
      imageKey: parsed.imageKey || null,
      previewDataUrl: parsed.previewDataUrl || null,
    };
  } catch {
    return {
      imageKey: value.startsWith('img_') ? value : null,
      previewDataUrl: value.startsWith('data:image/') ? value : null,
    };
  }
}

function toSourceType(value: string): NoteJob['sourceType'] {
  return value === 'video' ||
    value === 'audio' ||
    value === 'paired' ||
    value === 'document' ||
    value === 'pdf'
    ? value
    : 'platform';
}

function toJobStage(value: string | null): JobStage {
  const stages: readonly JobStage[] = [
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
    'failed',
  ];
  return stages.includes(value as JobStage) ? (value as JobStage) : 'queued';
}
