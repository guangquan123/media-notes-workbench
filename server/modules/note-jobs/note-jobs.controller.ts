import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request, Response } from 'express';
import type {
  CreateNoteJobRequest,
  NoteStyle,
  UpdateNoteTemplateConfigRequest,
} from '@shared/api.interface';
import { NoteHistoryService } from './note-history.service';
import { NoteJobsService } from './note-jobs.service';
import { NoteTemplateService } from './note-template.service';
import { buildRawTranscriptMarkdown } from './note-document.utils';

interface AuthenticatedRequest extends Request {
  userContext: {
    userId: string;
  };
}

@Controller('api/note-jobs')
export class NoteJobsController {
  constructor(
    private readonly noteJobsService: NoteJobsService,
    private readonly noteHistoryService: NoteHistoryService,
    private readonly noteTemplateService: NoteTemplateService,
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
  history(@Req() req: AuthenticatedRequest) {
    return this.noteHistoryService.list(req.userContext.userId);
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
}
