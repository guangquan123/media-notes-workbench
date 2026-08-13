import { Module } from '@nestjs/common';
import { LocalUploadsController } from './local-uploads.controller';

@Module({
  controllers: [LocalUploadsController],
})
export class LocalUploadsModule {}
