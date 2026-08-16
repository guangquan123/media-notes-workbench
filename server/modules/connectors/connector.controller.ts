import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  ConnectorSettingsResponse,
  ConnectorTestResponse,
  UpdateConnectorRequest,
} from '@shared/api.interface';
import { ConnectorRegistryService } from './connector-registry.service';
import { LocalDocumentService } from './local-document.service';
import { FeishuAuthService } from './feishu-auth.service';
import { DingTalkAuthService } from './dingtalk-auth.service';

@Controller('api/connectors')
export class ConnectorController {
  private readonly logger = new Logger(ConnectorController.name);

  constructor(
    private readonly registry: ConnectorRegistryService,
    private readonly localDocumentService: LocalDocumentService,
    private readonly feishuAuthService: FeishuAuthService,
    private readonly dingTalkAuthService: DingTalkAuthService,
  ) {}

  @NeedLogin()
  @Get()
  getSettings(): Promise<ConnectorSettingsResponse> {
    return this.registry.getSettings();
  }

  @NeedLogin()
  @Put('active')
  setActive(
    @Body('connector') connector: string,
  ): Promise<ConnectorSettingsResponse> {
    return this.registry.setActive(connector);
  }

  @NeedLogin()
  @Put(':type/config')
  update(
    @Param('type') type: string,
    @Body() body: UpdateConnectorRequest,
  ): Promise<ConnectorSettingsResponse> {
    return this.registry.update(type, body);
  }

  @NeedLogin()
  @Post(':type/test')
  async test(@Param('type') type: string): Promise<ConnectorTestResponse> {
    const checkedAt = new Date().toISOString();
    if (type === 'local')
      return {
        checkedAt,
        connector: 'local',
        message: '本地连接器始终可用',
        status: 'success',
      };
    if (type === 'feishu') {
      const r = await this.feishuAuthService.testConnection();
      return {
        checkedAt,
        connector: 'feishu',
        message: r.message,
        status: r.ok ? 'success' : 'failed',
      };
    }
    if (type === 'dingtalk') {
      const r = await this.dingTalkAuthService.testConnection();
      return {
        checkedAt,
        connector: 'dingtalk',
        message: r.message,
        status: r.ok ? 'success' : 'failed',
      };
    }
    throw new BadRequestException('不支持的连接器类型');
  }

  @NeedLogin()
  @Get('feishu/app-info')
  getFeishuAppInfo() {
    return this.feishuAuthService.getAppInfo();
  }

  @NeedLogin()
  @Post('feishu/auth/initiate')
  initiateFeishuAuth(@Body() body: { appId?: string; appSecret?: string }) {
    return this.feishuAuthService.initiate(body.appId, body.appSecret);
  }

  @NeedLogin()
  @Post('dingtalk/auth/initiate')
  async initiateDingTalkAuth() {
    const result = await this.dingTalkAuthService.initiate();
    if (!result.alreadyAuthenticated) return result;
    const executorSync = await this.syncDingTalkTaskExecutor();
    return { ...result, message: executorSync.message };
  }

  @NeedLogin()
  @Post('dingtalk/auth/complete')
  async completeDingTalkAuth(@Body('sessionId') sessionId: string) {
    const result = await this.dingTalkAuthService.complete(sessionId);
    if (!result.completed) return result;
    const executorSync = await this.syncDingTalkTaskExecutor();
    return { ...result, message: `${result.message}；${executorSync.message}` };
  }

  private async syncDingTalkTaskExecutor(): Promise<{ message: string }> {
    try {
      const user = await this.dingTalkAuthService.getAuthorizedUser();
      await this.registry.setDingTalkTaskExecutorUserId(user.userId);
      return { message: '已自动填入授权人的待办执行人 ID' };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`未能自动填入钉钉待办执行人 ID: ${message}`);
      return { message: `未能自动填入待办执行人 ID：${message}` };
    }
  }

  @NeedLogin()
  @Post('feishu/auth/logout')
  logoutFeishu() {
    return this.feishuAuthService.logout();
  }

  @NeedLogin()
  @Post('dingtalk/auth/logout')
  logoutDingTalk() {
    return this.dingTalkAuthService.logout();
  }

  @NeedLogin()
  @Post('feishu/auth/complete')
  completeFeishuAuth(@Body('sessionId') sessionId: string) {
    return this.feishuAuthService.complete(sessionId);
  }

  @Get('local/documents/:id')
  @NeedLogin()
  async getLocalDocument(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const markdown = await this.localDocumentService.read(id);
    response.type('text/markdown').send(markdown);
  }
}
