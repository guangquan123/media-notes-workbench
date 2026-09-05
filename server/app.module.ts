import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ArticleExportModule } from './modules/article-export/article-export.module';
import { ViewModule } from './modules/view/view.module';
import { NoteJobsModule } from './modules/note-jobs/note-jobs.module';
import { NoteInboxModule } from './modules/note-inbox/note-inbox.module';
import { TaskNotificationModule } from './modules/task-notifications/task-notification.module';
import { ConnectorModule } from './modules/connectors/connector.module';
import { RuntimeModule } from './modules/runtime/runtime.module';
import { DatabaseModule } from './database/database.module';
import { LocalPlatformModule } from './modules/runtime/local-platform.module';
import { LocalUploadsModule } from './modules/local-uploads/local-uploads.module';
import { RecordingAssetsModule } from './modules/recording-assets/recording-assets.module';
import { isLocalRuntime } from './modules/runtime/runtime.config';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    ...(isLocalRuntime() ? [] : [PlatformModule.forRoot()]),
    DatabaseModule.forRoot(),
    ...(isLocalRuntime() ? [LocalPlatformModule] : []),
    // ====== @route-section: business-modules START ======
    ArticleExportModule,
    NoteJobsModule,
    NoteInboxModule,
    TaskNotificationModule,
    ConnectorModule,
    RuntimeModule,
    LocalUploadsModule,
    RecordingAssetsModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
