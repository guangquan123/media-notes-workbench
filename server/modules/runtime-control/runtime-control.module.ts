import { Module } from '@nestjs/common';
import { NoteJobsModule } from '../note-jobs/note-jobs.module';
import { RuntimeControlController } from './runtime-control.controller';
import { RuntimeControlService } from './runtime-control.service';
import { RuntimeControlAuthService } from './runtime-control-auth.service';

@Module({
  controllers: [RuntimeControlController],
  imports: [NoteJobsModule],
  providers: [RuntimeControlAuthService, RuntimeControlService],
})
export class RuntimeControlModule {}
