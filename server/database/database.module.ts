import { DynamicModule, Global, Module } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { getLocalConfigPath } from '../common/utils/local-runtime-paths';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import { DEFAULT_RUNTIME_CONFIG, normalizeRuntimeConfig } from '../modules/runtime/runtime.config';
import { createLocalDatabase } from './database.factory';
import type { AppDatabase } from './database.types';

function loadRuntimeConfig() {
  try {
    const raw = readFileSync(getLocalConfigPath('.runtime-config.json'), 'utf8');
    return normalizeRuntimeConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_RUNTIME_CONFIG;
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    if (loadRuntimeConfig().mode !== 'local') {
      return { module: DatabaseModule };
    }
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DRIZZLE_DATABASE,
          useFactory: (): Promise<AppDatabase> => createLocalDatabase(),
        },
      ],
      exports: [DRIZZLE_DATABASE],
    };
  }
}
