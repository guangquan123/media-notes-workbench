import { Module } from '@nestjs/common';
import { NoteJobsController } from './note-jobs.controller';
import { NoteJobsService } from './note-jobs.service';

@Module({
  controllers: [NoteJobsController],
  providers: [NoteJobsService],
})
export class NoteJobsModule {}
