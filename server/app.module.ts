import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ArticleExportModule } from './modules/article-export/article-export.module';
import { ViewModule } from './modules/view/view.module';
import { NoteJobsModule } from './modules/note-jobs/note-jobs.module';
import { NoteInboxModule } from './modules/note-inbox/note-inbox.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot(),
    // ====== @route-section: business-modules START ======
    ArticleExportModule,
    NoteJobsModule,
    NoteInboxModule,
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
