import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { CreateNoteJobRequest } from '@shared/api.interface';
import { NoteJobsService } from './note-jobs.service';

@Controller('api/note-jobs')
export class NoteJobsController {
  constructor(private readonly noteJobsService: NoteJobsService) {}

  @Get('readiness')
  readiness() {
    return this.noteJobsService.getReadiness();
  }

  @Post()
  create(@Body() body: CreateNoteJobRequest) {
    return this.noteJobsService.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.noteJobsService.get(id);
  }
}
