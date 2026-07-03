import { Module } from '@nestjs/common';
import { ArticleExportController } from './article-export.controller';
import { ArticleExportService } from './article-export.service';

@Module({
  controllers: [ArticleExportController],
  providers: [ArticleExportService],
})
export class ArticleExportModule {}
