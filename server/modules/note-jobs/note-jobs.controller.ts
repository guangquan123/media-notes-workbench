import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import type { CreateNoteJobRequest } from '@shared/api.interface';
import { NoteHistoryService } from './note-history.service';
import { NoteJobsService } from './note-jobs.service';

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
  ) {}

  @Get('readiness')
  readiness() {
    return this.noteJobsService.getReadiness();
  }

  @NeedLogin()
  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateNoteJobRequest,
  ) {
    return this.noteJobsService.create(body, req.userContext.userId);
  }

  @NeedLogin()
  @Get('history')
  history(@Req() req: AuthenticatedRequest) {
    return this.noteHistoryService.list(req.userContext.userId);
  }

  @NeedLogin()
  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.noteJobsService.get(id, req.userContext.userId);
  }
}
