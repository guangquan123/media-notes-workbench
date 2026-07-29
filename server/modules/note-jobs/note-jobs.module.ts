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
import { FrameReviewService } from './frame-review.service';
import { TencentAsrSettingsService } from './tencent-asr-settings.service';
import { TencentAsrTranscriptionService } from './tencent-asr-transcription.service';
import { ExternalModelSettingsService } from './external-model-settings.service';

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
    FrameReviewService,
    TencentAsrSettingsService,
    TencentAsrTranscriptionService,
    ExternalModelSettingsService,
  ],
  exports: [NoteJobsService],
})
export class NoteJobsModule {}
