import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import type {
  CreateNoteJobRequest,
  NoteStyle,
  UpdateNoteTemplateConfigRequest,
} from '@shared/api.interface';
import { NoteHistoryService } from './note-history.service';
import { NoteJobsService } from './note-jobs.service';
import { NoteTemplateService } from './note-template.service';

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
    return this.noteTemplateService.update(
      req.userContext.userId,
      style,
      body.content,
    );
  }

  @NeedLogin()
  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.noteJobsService.get(id, req.userContext.userId);
  }
}
