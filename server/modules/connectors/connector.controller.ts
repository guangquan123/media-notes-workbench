import { Body, Controller, Get, Param, Post, Put, Res } from '@nestjs/common';
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

@Controller('api/connectors')
export class ConnectorController {
  constructor(
    private readonly registry: ConnectorRegistryService,
    private readonly localDocumentService: LocalDocumentService,
    private readonly feishuAuthService: FeishuAuthService,
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
  test(@Param('type') type: string): Promise<ConnectorTestResponse> {
    return this.registry.test(type);
  }

  @NeedLogin()
  @Post('feishu/auth/initiate')
  initiateFeishuAuth() {
    return this.feishuAuthService.initiate();
  }

  @NeedLogin()
  @Post('feishu/auth/complete')
  completeFeishuAuth(@Body('deviceCode') deviceCode: string) {
    return this.feishuAuthService.complete(deviceCode);
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
