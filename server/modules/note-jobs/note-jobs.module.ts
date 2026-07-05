import { Module } from '@nestjs/common';
import { NoteJobsController } from './note-jobs.controller';
import { NoteHistoryService } from './note-history.service';
import { NoteJobsService } from './note-jobs.service';

@Module({
  controllers: [NoteJobsController],
  providers: [NoteHistoryService, NoteJobsService],
})
export class NoteJobsModule {}
