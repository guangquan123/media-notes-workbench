import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type {
  ArticlePlatform,
  CreateArticleExportJobRequest,
} from '@shared/api.interface';
import { ArticleExportService } from './article-export.service';

@Controller('api/article-export')
export class ArticleExportController {
  constructor(private readonly articleExportService: ArticleExportService) {}

  @Get('readiness')
  readiness() {
    return this.articleExportService.getReadiness();
  }

  @Post()
  create(@Body() body: CreateArticleExportJobRequest) {
    return this.articleExportService.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.articleExportService.get(id);
  }

  @Get(':id/artifacts/:platform')
  getArtifact(
    @Param('id') id: string,
    @Param('platform') platform: ArticlePlatform,
  ) {
    return this.articleExportService.getArtifact(id, platform);
  }
}
