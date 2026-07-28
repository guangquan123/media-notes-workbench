import { Module } from '@nestjs/common';
import { NoteJobsController } from './note-jobs.controller';
import { NoteHistoryService } from './note-history.service';
import { NoteJobsService } from './note-jobs.service';
import { NoteTemplateService } from './note-template.service';
import { NoteReviewTaskService } from './note-review-task.service';
import { FrameExtractionService } from './frame-extraction.service';
import { FrameUploadService } from './frame-upload.service';
import { FrameAiEnhanceService } from './frame-ai-enhance.service';
import { FrameInsertionService } from './frame-insertion.service';

@Module({
  controllers: [NoteJobsController],
  providers: [
    NoteHistoryService,
    NoteJobsService,
    NoteReviewTaskService,
    NoteTemplateService,
    FrameExtractionService,
    FrameUploadService,
    FrameAiEnhanceService,
    FrameInsertionService,
  ],
  exports: [NoteJobsService],
})
export class NoteJobsModule {}
