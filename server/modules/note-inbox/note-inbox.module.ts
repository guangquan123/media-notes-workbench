import { Module } from '@nestjs/common';
import { NoteJobsModule } from '../note-jobs/note-jobs.module';
import { NoteInboxController } from './note-inbox.controller';
import { NoteInboxService } from './note-inbox.service';

@Module({
  imports: [NoteJobsModule],
  controllers: [NoteInboxController],
  providers: [NoteInboxService],
})
export class NoteInboxModule {}
