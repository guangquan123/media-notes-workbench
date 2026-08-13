import { Module } from '@nestjs/common';
import { ConnectorController } from './connector.controller';
import { ConnectorRegistryService } from './connector-registry.service';
import { LocalDocumentService } from './local-document.service';
import { DingTalkDocumentService } from './dingtalk-document.service';
import { DingTalkTaskService } from './dingtalk-task.service';

@Module({
  controllers: [ConnectorController],
  exports: [ConnectorRegistryService, LocalDocumentService, DingTalkDocumentService, DingTalkTaskService],
  providers: [ConnectorRegistryService, LocalDocumentService, DingTalkDocumentService, DingTalkTaskService],
})
export class ConnectorModule {}
