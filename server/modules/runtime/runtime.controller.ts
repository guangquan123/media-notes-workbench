import { Controller, Get } from '@nestjs/common';
import type { RuntimeStatus } from '@shared/api.interface';
import { RuntimeRegistryService } from './runtime.registry.service';

@Controller('api/runtime')
export class RuntimeController {
  constructor(private readonly registry: RuntimeRegistryService) {}

  @Get()
  getStatus(): Promise<RuntimeStatus> {
    return this.registry.getStatus();
  }
}
