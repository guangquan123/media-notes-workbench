import { Module } from '@nestjs/common';
import { ConnectorController } from './connector.controller';
import { ConnectorRegistryService } from './connector-registry.service';
import { DingTalkDocumentService } from './dingtalk-document.service';
import { DingTalkTaskService } from './dingtalk-task.service';
import { FeishuAuthService } from './feishu-auth.service';
import { DingTalkAuthService } from './dingtalk-auth.service';

@Module({
  controllers: [ConnectorController],
  exports: [ConnectorRegistryService, DingTalkDocumentService, DingTalkTaskService, FeishuAuthService],
  providers: [ConnectorRegistryService, DingTalkDocumentService, DingTalkTaskService, FeishuAuthService, DingTalkAuthService],
})
export class ConnectorModule {}
