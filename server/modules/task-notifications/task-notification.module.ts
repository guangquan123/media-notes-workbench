import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TaskNotificationController } from './task-notification.controller';
import { TaskNotificationService } from './task-notification.service';

@Module({
  controllers: [TaskNotificationController],
  exports: [TaskNotificationService],
  imports: [HttpModule],
  providers: [TaskNotificationService],
})
export class TaskNotificationModule {}
