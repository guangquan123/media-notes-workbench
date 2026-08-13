import { Module } from '@nestjs/common';
import { ConnectorController } from './connector.controller';
import { ConnectorRegistryService } from './connector-registry.service';
import { LocalDocumentService } from './local-document.service';

@Module({
  controllers: [ConnectorController],
  exports: [ConnectorRegistryService, LocalDocumentService],
  providers: [ConnectorRegistryService, LocalDocumentService],
})
export class ConnectorModule {}
