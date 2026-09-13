import { Controller, Get, Param, Res } from '@nestjs/common';
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
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const document = await this.localDocumentService.read(id);
    response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    return document.content;
  }
}
