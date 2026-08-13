import { DynamicModule, Module } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import { DEFAULT_RUNTIME_CONFIG, normalizeRuntimeConfig } from '../modules/runtime/runtime.config';
import { createLocalDatabase } from './database.factory';
import type { AppDatabase } from './database.types';

function loadRuntimeConfig() {
  try {
    const raw = readFileSync(join(process.cwd(), '.runtime-config.json'), 'utf8');
    return normalizeRuntimeConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_RUNTIME_CONFIG;
  }
}

@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    if (loadRuntimeConfig().mode !== 'local') {
      return { module: DatabaseModule };
    }
    return {
      module: DatabaseModule,
      providers: [{ provide: DRIZZLE_DATABASE, useFactory: (): AppDatabase => createLocalDatabase() }],
      exports: [DRIZZLE_DATABASE],
    };
  }
}
