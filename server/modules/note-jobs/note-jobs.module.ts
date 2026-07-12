import { Module } from '@nestjs/common';
import { NoteJobsController } from './note-jobs.controller';
import { NoteHistoryService } from './note-history.service';
import { NoteJobsService } from './note-jobs.service';
import { NoteTemplateService } from './note-template.service';

@Module({
  controllers: [NoteJobsController],
  providers: [NoteHistoryService, NoteJobsService, NoteTemplateService],
})
export class NoteJobsModule {}
