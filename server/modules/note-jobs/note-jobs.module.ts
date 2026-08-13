import { Module } from '@nestjs/common';
import { FileService as PlatformStorageClient } from '@lark-apaas/file-service';
import { PlatformHttpClientService } from '@lark-apaas/fullstack-nestjs-core';
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
import { NoteSummaryPipelineService } from './note-summary-pipeline.service';
import { LocalDocumentParserService } from './local-document-parser.service';
import { ConnectorModule } from '../connectors/connector.module';
import { TaskNotificationModule } from '../task-notifications/task-notification.module';
import {
  DOCUMENT_STORAGE_CLIENT,
  DocumentImageDownloadService,
} from './document-image-download.service';

@Module({
  controllers: [NoteJobsController],
  imports: [ConnectorModule, TaskNotificationModule],
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
    NoteSummaryPipelineService,
    {
      provide: DOCUMENT_STORAGE_CLIENT,
      inject: [PlatformHttpClientService],
      useFactory: (
        httpClientService: PlatformHttpClientService,
      ): PlatformStorageClient =>
        new PlatformStorageClient(httpClientService.instance),
    },
    DocumentImageDownloadService,
    LocalDocumentParserService,
  ],
  exports: [NoteJobsService],
})
export class NoteJobsModule {}
