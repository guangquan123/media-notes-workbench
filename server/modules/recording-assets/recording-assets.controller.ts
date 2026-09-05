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
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import type {
  CreateRecordingAssetRequest,
  UpdateRecordingAssetRequest,
  UpdateRecordingStorageSettingsRequest,
} from '@shared/api.interface';
import { RecordingAssetsService } from './recording-assets.service';

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
