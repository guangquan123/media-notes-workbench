import { Global, Module } from '@nestjs/common';
import { CapabilityService, PlatformHttpClientService, AuthNPaasService } from '@lark-apaas/fullstack-nestjs-core';
import axios from 'axios';

const localAuth = {
  getCurrentUserLarkUserId: async (): Promise<string | null> => null,
} as unknown as AuthNPaasService;

const localCapability = {
  listCapabilities: () => [],
  getCapability: () => null,
  load: () => { throw new Error("本地模式未配置 AI 能力：文档解析/关键帧理解等需要配置外部多模态模型。"); },
} as unknown as CapabilityService;

@Global()
@Module({
  providers: [
    { provide: AuthNPaasService, useValue: localAuth },
    { provide: CapabilityService, useValue: localCapability },
    { provide: PlatformHttpClientService, useFactory: () => ({ instance: axios.create() }) as unknown as PlatformHttpClientService },
  ],
  exports: [AuthNPaasService, CapabilityService, PlatformHttpClientService],
})
export class LocalPlatformModule {}
