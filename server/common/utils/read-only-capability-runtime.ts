import { AsyncLocalStorage } from 'node:async_hooks';
import {
  CapabilityService,
  PlatformHttpClientService,
  PluginLoaderService,
  TelemetryService,
  TemplateEngineService,
} from '@lark-apaas/fullstack-nestjs-core';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

interface ReadOnlyRequestContextState {
  [key: string]: unknown;
}

class ReadOnlyRequestContextService {
  private readonly storage = new AsyncLocalStorage<ReadOnlyRequestContextState>();

  run<T>(
    context: ReadOnlyRequestContextState,
    callback: () => T,
  ): T {
    return this.storage.run({ ...context }, callback);
  }

  setContext(partial: ReadOnlyRequestContextState): void {
    const store: ReadOnlyRequestContextState | undefined =
      this.storage.getStore();
    if (store) Object.assign(store, partial);
  }

  getContext(): ReadOnlyRequestContextState | undefined {
    return this.storage.getStore();
  }

  get(key: string): unknown {
    return this.storage.getStore()?.[key];
  }
}

type ReadOnlyHttpClientFactory = {
  create: (
    options?: unknown,
  ) => ReturnType<PlatformHttpClientService['createWithGlobalInterceptors']>;
};

interface ReadOnlyCapabilityRuntime {
  capabilityService: CapabilityService;
  close: () => Promise<void>;
}

async function createReadOnlyCapabilityRuntime(
  capabilitiesDir: string,
): Promise<ReadOnlyCapabilityRuntime> {
  loadEnvironment({
    path: [resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env')],
    quiet: true,
  });
  const requestContextService = new ReadOnlyRequestContextService();
  const platformHttpClientService: PlatformHttpClientService =
    new PlatformHttpClientService(
      requestContextService as unknown as ConstructorParameters<
        typeof PlatformHttpClientService
      >[0],
    );
  const httpClientFactory: ReadOnlyHttpClientFactory = {
    create: () => platformHttpClientService.createWithGlobalInterceptors(),
  };
  const pluginLoaderService: PluginLoaderService = new PluginLoaderService();
  const templateEngineService: TemplateEngineService =
    new TemplateEngineService();
  const telemetryService: TelemetryService = new TelemetryService(
    platformHttpClientService.instance,
  );
  const capabilityService: CapabilityService = new CapabilityService(
    requestContextService as unknown as ConstructorParameters<
      typeof CapabilityService
    >[0],
    httpClientFactory as unknown as ConstructorParameters<
      typeof CapabilityService
    >[1],
    pluginLoaderService,
    templateEngineService,
    telemetryService,
  );

  capabilityService.setOptions({
    capabilitiesDir,
    enableWatching: false,
  });
  await capabilityService.onModuleInit();

  let closed: boolean = false;
  return {
    capabilityService,
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await capabilityService.onModuleDestroy();
    },
  };
}

export {
  createReadOnlyCapabilityRuntime,
  type ReadOnlyCapabilityRuntime,
};
