import { Module } from '@nestjs/common';
import { NoteJobsController } from './note-jobs.controller';
import { NoteHistoryService } from './note-history.service';
import { NoteJobsService } from './note-jobs.service';
import { NoteTemplateService } from './note-template.service';
import { NoteReviewTaskService } from './note-review-task.service';

@Module({
  controllers: [NoteJobsController],
  providers: [
    NoteHistoryService,
    NoteJobsService,
    NoteReviewTaskService,
    NoteTemplateService,
  ],
  exports: [NoteJobsService],
})
export class NoteJobsModule {}
