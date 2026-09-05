import { Module } from '@nestjs/common';
import { RecordingAssetsController } from './recording-assets.controller';
import { RecordingAssetsService } from './recording-assets.service';

@Module({
  controllers: [RecordingAssetsController],
  providers: [RecordingAssetsService],
  exports: [RecordingAssetsService],
})
export class RecordingAssetsModule {}
