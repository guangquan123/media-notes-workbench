import { Module } from '@nestjs/common';
import { NoteJobsModule } from '../note-jobs/note-jobs.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { SetupStateService } from './setup-state.service';

@Module({
  controllers: [SetupController],
  exports: [SetupService],
  imports: [NoteJobsModule],
  providers: [SetupService, SetupStateService],
})
export class SetupModule {}
