import { Module } from '@nestjs/common';
import { ArticleExportController } from './article-export.controller';
import { ArticleExportService } from './article-export.service';
import { TaskNotificationModule } from '../task-notifications/task-notification.module';

@Module({
  controllers: [ArticleExportController],
  imports: [TaskNotificationModule],
  providers: [ArticleExportService],
})
export class ArticleExportModule {}
