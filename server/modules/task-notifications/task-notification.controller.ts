import { BadRequestException, Controller, Param, Post } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  ConnectorType,
  TaskNotificationConnectionStatus,
} from '@shared/api.interface';
import { isConnectorType } from '../connectors/connector.utils';
import { TaskNotificationService } from './task-notification.service';

@Controller('api/connectors')
export class TaskNotificationController {
  constructor(
    private readonly taskNotificationService: TaskNotificationService,
  ) {}

  @NeedLogin()
  @Post(':type/webhook/test')
  test(
    @Param('type') type: string,
  ): Promise<TaskNotificationConnectionStatus> {
    if (!isConnectorType(type)) {
      throw new BadRequestException('不支持的连接器类型。');
    }
    return this.taskNotificationService.testConnectorWebhook(type);
  }
}
