import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  CreateTaskNotificationWebhookRequest,
  TaskNotificationConnectionStatus,
  TaskNotificationSettings,
  UpdateTaskNotificationWebhookRequest,
} from '@shared/api.interface';
import { TaskNotificationService } from './task-notification.service';

@Controller('api/task-notifications')
export class TaskNotificationController {
  constructor(
    private readonly taskNotificationService: TaskNotificationService,
  ) {}

  @NeedLogin()
  @Get()
  getSettings(): Promise<TaskNotificationSettings> {
    return this.taskNotificationService.getSettings();
  }

  @NeedLogin()
  @Post('webhooks')
  create(
    @Body() body: CreateTaskNotificationWebhookRequest,
  ): Promise<TaskNotificationSettings> {
    return this.taskNotificationService.create(body);
  }

  @NeedLogin()
  @Put('webhooks/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateTaskNotificationWebhookRequest,
  ): Promise<TaskNotificationSettings> {
    return this.taskNotificationService.update(id, body);
  }

  @NeedLogin()
  @Delete('webhooks/:id')
  remove(@Param('id') id: string): Promise<TaskNotificationSettings> {
    return this.taskNotificationService.remove(id);
  }

  @NeedLogin()
  @Post('webhooks/test')
  testInput(
    @Body() body: CreateTaskNotificationWebhookRequest,
  ): Promise<TaskNotificationConnectionStatus> {
    return this.taskNotificationService.testInput(body);
  }

  @NeedLogin()
  @Post('webhooks/:id/test')
  test(@Param('id') id: string): Promise<TaskNotificationConnectionStatus> {
    return this.taskNotificationService.test(id);
  }
}
