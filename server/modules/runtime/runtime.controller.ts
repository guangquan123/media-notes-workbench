import { Controller, Get, Post, Query } from '@nestjs/common';
import type { RuntimeStatus } from '@shared/api.interface';
import { RuntimeRegistryService } from './runtime.registry.service';

@Controller('api/runtime')
export class RuntimeController {
  constructor(private readonly registry: RuntimeRegistryService) {}

  @Get()
  getStatus(): Promise<RuntimeStatus> {
    return this.registry.getStatus();
  }

  @Post('launcher-ready')
  reportLauncherReady(@Query('token') token?: string): Promise<{ ready: boolean }> {
    return this.registry.recordLauncherUiReady(token || '');
  }
}
