import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TaskNotificationController } from './task-notification.controller';
import { TaskNotificationService } from './task-notification.service';
import { ConnectorModule } from '../connectors/connector.module';

@Module({
  controllers: [TaskNotificationController],
  exports: [TaskNotificationService],
  imports: [ConnectorModule, HttpModule],
  providers: [TaskNotificationService],
})
export class TaskNotificationModule {}
