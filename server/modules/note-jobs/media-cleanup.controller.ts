import { Body, Controller, Get, Post, Put, Req } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import type {
  RunMediaCleanupRequest,
  UpdateMediaCleanupSettingsRequest,
} from '@shared/api.interface';
import { MediaCleanupService } from './media-cleanup.service';

interface AuthenticatedRequest extends Request {
  userContext: {
    userId: string;
  };
}

@NeedLogin()
@Controller('api/media-cleanup')
export class MediaCleanupController {
  constructor(private readonly mediaCleanupService: MediaCleanupService) {}

  @Get('settings')
  getSettings(@Req() request: AuthenticatedRequest) {
    return this.mediaCleanupService.getSettings(request.userContext.userId);
  }

  @Put('settings')
  updateSettings(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateMediaCleanupSettingsRequest,
  ) {
    return this.mediaCleanupService.updateSettings(
      request.userContext.userId,
      body,
    );
  }

  @Get('files')
  getFiles(@Req() request: AuthenticatedRequest) {
    return this.mediaCleanupService.getInventory(request.userContext.userId);
  }

  @Get('history')
  getHistory(@Req() request: AuthenticatedRequest) {
    return this.mediaCleanupService.getHistory(request.userContext.userId);
  }

  @Post('run')
  run(
    @Req() request: AuthenticatedRequest,
    @Body() body: RunMediaCleanupRequest,
  ) {
    return this.mediaCleanupService.runCleanup(
      request.userContext.userId,
      body || {},
      'manual',
    );
  }
}
