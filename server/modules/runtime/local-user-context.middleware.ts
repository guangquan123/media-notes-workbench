import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RUNTIME_CONFIG, normalizeRuntimeConfig } from './runtime.config';

@Injectable()
export class LocalUserContextMiddleware implements NestMiddleware {
  private readonly ownerId: string;

  constructor() {
    let config = DEFAULT_RUNTIME_CONFIG;
    try {
      config = normalizeRuntimeConfig(JSON.parse(readFileSync(join(process.cwd(), '.runtime-config.json'), 'utf8')));
    } catch {
      // keep defaults
    }
    this.ownerId = config.auth.ownerId || 'local-owner';
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    (req as unknown as { userContext?: Record<string, unknown> }).userContext = {
      userId: this.ownerId,
      tenantId: 'local',
      appId: 'local',
      env: 'runtime',
      userName: '本地用户',
    };
    next();
  }
}
