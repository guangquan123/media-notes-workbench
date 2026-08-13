import { Global, Module } from '@nestjs/common';
import { RuntimeController } from './runtime.controller';
import { RuntimeRegistryService } from './runtime.registry.service';

@Global()
@Module({
  controllers: [RuntimeController],
  exports: [RuntimeRegistryService],
  providers: [RuntimeRegistryService],
})
export class RuntimeModule {}
