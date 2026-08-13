import { BadRequestException, Body, Controller, Get, Param, Post, Put, Res } from '@nestjs/common';
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
  setActive(@Body('connector') connector: string): Promise<ConnectorSettingsResponse> {
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
    if (type === 'local') return { checkedAt, connector: 'local', message: '本地连接器始终可用', status: 'success' };
    if (type === 'feishu') { const r = await this.feishuAuthService.testConnection(); return { checkedAt, connector: 'feishu', message: r.message, status: r.ok ? 'success' : 'failed' }; }
    if (type === 'dingtalk') { const r = await this.dingTalkAuthService.testConnection(); return { checkedAt, connector: 'dingtalk', message: r.message, status: r.ok ? 'success' : 'failed' }; }
    throw new BadRequestException('不支持的连接器类型');
  }

  @NeedLogin()
  @Post('feishu/auth/initiate')
  initiateFeishuAuth() {
    return this.feishuAuthService.initiate();
  }

  @NeedLogin()
  @Post('dingtalk/auth/initiate')
  initiateDingTalkAuth() {
    return this.dingTalkAuthService.initiate();
  }

  @NeedLogin()
  @Post('dingtalk/auth/complete')
  completeDingTalkAuth(@Body('sessionId') sessionId: string) {
    return this.dingTalkAuthService.complete(sessionId);
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
