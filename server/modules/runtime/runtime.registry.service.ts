import { Injectable, Optional } from '@nestjs/common';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RuntimeStatus } from '@shared/api.interface';
import { DEFAULT_RUNTIME_CONFIG, normalizeRuntimeConfig, type RuntimeConfig, type RuntimeMode } from './runtime.config';

@Injectable()
export class RuntimeRegistryService {
  private readonly configPath = join(process.cwd(), '.runtime-config.json');
  private readonly launcherOperationTokenPath = join(
    process.cwd(),
    'pids',
    'launcher-operation.token',
  );
  private readonly launcherUiReadyTokenPath = join(
    process.cwd(),
    'pids',
    'launcher-ui-ready.token',
  );
  private current: RuntimeConfig | undefined;

  constructor(@Optional() configPath?: string) {
    if (configPath) this.configPath = configPath;
  }

  async getConfig(): Promise<RuntimeConfig> {
    if (this.current) return this.current;
    try {
      const raw = await readFile(this.configPath, 'utf8');
      this.current = normalizeRuntimeConfig(JSON.parse(raw));
    } catch {
      this.current = DEFAULT_RUNTIME_CONFIG;
    }
    return this.current;
  }

  async getMode(): Promise<RuntimeMode> {
    return (await this.getConfig()).mode;
  }

  async isLocal(): Promise<boolean> {
    return (await this.getMode()) === 'local';
  }

  async getStatus(): Promise<RuntimeStatus> {
    const config = await this.getConfig();
    return {
      mode: config.mode,
      label: config.mode === 'local' ? '本地' : '妙搭平台',
      auth: config.auth.kind === 'local' ? 'local' : 'platform',
      database: config.database.kind === 'sqlite' ? 'local' : 'platform',
      ai: config.ai.provider === 'external' ? 'external' : 'builtin',
      storage: config.storage.kind === 'local' ? 'local' : 'platform',
      ready: true,
    };
  }

  async recordLauncherUiReady(token: string): Promise<{ ready: boolean }> {
    if (!token || token.length > 160) return { ready: false };

    try {
      const expected = (await readFile(this.launcherOperationTokenPath, 'utf8')).trim();
      if (!expected || token !== expected) return { ready: false };

      await writeFile(this.launcherUiReadyTokenPath, expected, 'utf8');
      return { ready: true };
    } catch {
      return { ready: false };
    }
  }
}
