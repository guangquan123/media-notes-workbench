import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Response } from 'express';
import { LocalDocumentService } from './local-document.service';

@Controller('api/note-jobs/local-documents')
export class LocalDocumentController {
  constructor(private readonly localDocumentService: LocalDocumentService) {}

  @NeedLogin()
  @Get(':id')
  async get(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const document = await this.localDocumentService.read(id);
    response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `${download === '1' ? 'attachment' : 'inline'}; ` +
        `filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    return document.content;
  }
}
