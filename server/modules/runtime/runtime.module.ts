import { Module } from '@nestjs/common';
import { RuntimeController } from './runtime.controller';
import { RuntimeRegistryService } from './runtime.registry.service';

@Module({
  controllers: [RuntimeController],
  exports: [RuntimeRegistryService],
  providers: [RuntimeRegistryService],
})
export class RuntimeModule {}
