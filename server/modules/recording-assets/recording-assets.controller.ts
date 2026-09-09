import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { Request, Response } from 'express';
import type {
  CreateRecordingAssetRequest,
  UpdateRecordingAssetRequest,
  UpdateRecordingStorageSettingsRequest,
} from '@shared/api.interface';
import { RecordingAssetsService } from './recording-assets.service';
import { resolveByteRange, type ByteRange } from '../local-uploads/local-uploads.utils';

interface AuthenticatedRequest extends Request {
  userContext: { userId: string };
}

@Controller('api/recording-assets')
export class RecordingAssetsController {
  constructor(private readonly service: RecordingAssetsService) {}

  @NeedLogin()
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('keyword') keyword?: string) {
    return this.service.list(req.userContext.userId, keyword);
  }

  @NeedLogin()
  @Get('settings')
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.service.getSettings(req.userContext.userId);
  }

  @NeedLogin()
  @Put('settings')
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateRecordingStorageSettingsRequest,
  ) {
    return this.service.updateSettings(req.userContext.userId, body);
  }

  @NeedLogin()
  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.get(req.userContext.userId, id);
  }

  @NeedLogin()
  @Post(':id/playable')
  requestPlayable(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.requestPlayable(req.userContext.userId, id);
  }

  @NeedLogin()
  @Post('repair-archives')
  repairArchives(@Req() req: AuthenticatedRequest) {
    return this.service.repairLegacyArchives(req.userContext.userId);
  }

  @NeedLogin()
  @Get(':id/playable')
  async playable(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const playable = await this.service.getPlayableFile(req.userContext.userId, id);
    if (!existsSync(playable.path)) {
      res.status(404).send('not found');
      return;
    }
    const fileSize = statSync(playable.path).size;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'audio/mp4');
    if (download === '1') {
      const fileName = encodeURIComponent(playable.fileName);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
    }
    const range = req.headers.range;
    if (!range) {
      res.setHeader('Content-Length', fileSize);
      createReadStream(playable.path).pipe(res);
      return;
    }
    const resolvedRange: ByteRange | null = resolveByteRange(range, fileSize);
    if (!resolvedRange) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).send();
      return;
    }
    const { end, start } = resolvedRange;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(playable.path, { start, end }).pipe(res);
  }

  @NeedLogin()
  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateRecordingAssetRequest,
  ) {
    return this.service.create(req.userContext.userId, body);
  }

  @NeedLogin()
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateRecordingAssetRequest,
  ) {
    return this.service.update(req.userContext.userId, id, body);
  }

  @NeedLogin()
  @Post(':id/archive')
  archive(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.archive(req.userContext.userId, id);
  }

  @NeedLogin()
  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.userContext.userId, id);
  }
}
