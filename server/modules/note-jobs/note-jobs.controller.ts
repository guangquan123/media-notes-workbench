import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request, Response } from 'express';
import type {
  CreateNoteJobRequest,
  ConversionStatus,
  MarkNoteProcessedBatchRequest,
  MarkNoteProcessedBatchResponse,
  MarkNoteProcessedResponse,
  NoteProcessingStatus,
  NoteSourceType,
  NoteStyle,
  UpdateNoteTemplateConfigRequest,
} from '@shared/api.interface';
import { NoteHistoryService } from './note-history.service';
import { NoteJobsService } from './note-jobs.service';
import { NoteTemplateService } from './note-template.service';
import { NoteReviewTaskService } from './note-review-task.service';
import { buildRawTranscriptMarkdown } from './note-document.utils';
import {
  normalizeHistoryDateRange,
  normalizeHistoryKeyword,
  normalizeHistoryPagination,
} from './note-history.utils';

interface AuthenticatedRequest extends Request {
  userContext: {
    userId: string;
  };
}

function isConversionStatus(value: string): value is ConversionStatus {
  return value === 'processing' || value === 'completed' || value === 'failed';
}

function isNoteSourceType(value: string): value is NoteSourceType {
  return (
    value === 'platform' ||
    value === 'video' ||
    value === 'audio' ||
    value === 'document' ||
    value === 'pdf'
  );
}

@Controller('api/note-jobs')
export class NoteJobsController {
  constructor(
    private readonly noteJobsService: NoteJobsService,
    private readonly noteHistoryService: NoteHistoryService,
    private readonly noteTemplateService: NoteTemplateService,
    private readonly noteReviewTaskService: NoteReviewTaskService,
  ) {}

  @Get('readiness')
  readiness() {
    return this.noteJobsService.getReadiness();
  }

  @NeedLogin()
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateNoteJobRequest) {
    return this.noteJobsService.create(body, req.userContext.userId);
  }

  @NeedLogin()
  @Get('history')
  history(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('processingStatus') processingStatus?: NoteProcessingStatus,
    @Query('sourceType') sourceType?: NoteSourceType,
    @Query('status') status?: ConversionStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('keyword') keyword?: string,
    @Query('jobId') jobId?: string,
    @Query('sourceChannel') sourceChannel?: 'feishu_inbox' | 'manual',
  ) {
    if (
      processingStatus &&
      processingStatus !== 'pending' &&
      processingStatus !== 'processed'
    ) {
      throw new BadRequestException('不支持的处理状态筛选');
    }
    if (sourceType && !isNoteSourceType(sourceType)) {
      throw new BadRequestException('不支持的资料类型筛选');
    }
    if (status && !isConversionStatus(status)) {
      throw new BadRequestException('不支持的转化结果筛选');
    }
    const pagination = normalizeHistoryPagination(page, pageSize);
    try {
      const dateRange = normalizeHistoryDateRange(dateFrom, dateTo);
      return this.noteHistoryService.list(req.userContext.userId, {
        ...dateRange,
        ...pagination,
        keyword: normalizeHistoryKeyword(keyword),
        jobId: jobId?.trim() || undefined,
        sourceChannel,
        processingStatus,
        sourceType,
        status,
      });
    } catch (error) {
      const message: string =
        error instanceof Error ? error.message : '日期筛选参数无效';
      throw new BadRequestException(message);
    }
  }

  @NeedLogin()
  @Post('history/:id/mark-processed')
  async markProcessed(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<MarkNoteProcessedResponse> {
    await this.markRecordProcessed(id, req.userContext.userId);
    const processedAt = new Date();
    return { processedAt: processedAt.toISOString() };
  }

  @NeedLogin()
  @Post('history/mark-processed')
  async markProcessedBatch(
    @Req() req: AuthenticatedRequest,
    @Body() body: MarkNoteProcessedBatchRequest,
  ): Promise<MarkNoteProcessedBatchResponse> {
    const jobIds: string[] = Array.from(new Set(body.jobIds || []));
    if (jobIds.length === 0 || jobIds.length > 10) {
      throw new BadRequestException('请选择 1 至 10 条待处理记录');
    }
    const processedJobIds: string[] = [];
    const skippedJobIds: string[] = [];
    const failed: Array<{ jobId: string; message: string }> = [];
    for (const jobId of jobIds) {
      try {
        const wasProcessed: boolean = await this.markRecordProcessed(
          jobId,
          req.userContext.userId,
        );
        if (wasProcessed) processedJobIds.push(jobId);
        else skippedJobIds.push(jobId);
      } catch (error) {
        const message: string =
          error instanceof Error ? error.message : '处理失败';
        failed.push({ jobId, message });
      }
    }
    return { failed, processedJobIds, skippedJobIds };
  }

  @NeedLogin()
  @Get('history/:id/raw-transcript')
  async downloadRawTranscript(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const transcript = await this.noteHistoryService.getRawTranscript(
      id,
      req.userContext.userId,
    );
    const date: string = transcript.startedAt.toISOString().slice(0, 10);
    const fileName: string = `原文-${transcript.title.slice(0, 80)}-${date}.md`;
    response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return buildRawTranscriptMarkdown({
      duration: '详见原文档',
      generatedDate: date,
      sourceLabel: transcript.sourceLabel,
      sourceUrl: transcript.rawDocumentUrl || '未保留原始链接',
      title: transcript.title,
      transcript: transcript.rawTranscript,
      uploader: '详见原文档',
    });
  }

  @NeedLogin()
  @Get('templates')
  templates(@Req() req: AuthenticatedRequest) {
    return this.noteTemplateService.list(req.userContext.userId);
  }

  @NeedLogin()
  @Put('templates/:style')
  updateTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('style') style: NoteStyle,
    @Body() body: UpdateNoteTemplateConfigRequest,
  ) {
    if (style !== 'learning' && style !== 'meeting') {
      throw new BadRequestException('不支持的笔记风格');
    }
    return this.noteTemplateService.saveDraft(
      req.userContext.userId,
      style,
      body.content,
    );
  }

  @NeedLogin()
  @Post('templates/:style/publish')
  publishTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('style') style: NoteStyle,
  ) {
    if (style !== 'learning' && style !== 'meeting') {
      throw new BadRequestException('不支持的笔记风格');
    }
    return this.noteTemplateService.publish(req.userContext.userId, style);
  }

  @NeedLogin()
  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.noteJobsService.get(id, req.userContext.userId);
  }

  private async markRecordProcessed(
    jobId: string,
    ownerId: string,
  ): Promise<boolean> {
    const reviewTask = await this.noteHistoryService.getReviewTask(
      jobId,
      ownerId,
    );
    if (reviewTask.processingStatus === 'processed') return false;
    if (reviewTask.taskSyncStatus === 'failed') {
      throw new BadRequestException('飞书待处理任务未创建成功，暂不能同步完成');
    }
    if (reviewTask.larkTaskGuid) {
      await this.noteReviewTaskService.complete(reviewTask.larkTaskGuid);
    }
    await this.noteHistoryService.markProcessed(jobId, ownerId);
    return true;
  }
}
