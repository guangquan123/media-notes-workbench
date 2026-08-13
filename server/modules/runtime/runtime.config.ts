export type RuntimeMode = 'miaoda' | 'local';

export interface RuntimeConfig {
  mode: RuntimeMode;
  database: { kind: 'platform' | 'sqlite'; file?: string };
  auth: { kind: 'platform' | 'local'; ownerId?: string };
  ai: { provider: 'builtin' | 'external' };
  storage: { kind: 'platform' | 'local'; root?: string };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  mode: 'miaoda',
  database: { kind: 'platform' },
  auth: { kind: 'platform' },
  ai: { provider: 'builtin' },
  storage: { kind: 'platform' },
};

export function normalizeRuntimeConfig(input: unknown): RuntimeConfig {
  if (!input || typeof input !== 'object') return DEFAULT_RUNTIME_CONFIG;
  const raw = input as Record<string, unknown>;
  const mode: RuntimeMode = raw.mode === 'local' ? 'local' : 'miaoda';
  const database = (raw.database as Record<string, unknown> | undefined) || {};
  const auth = (raw.auth as Record<string, unknown> | undefined) || {};
  const ai = (raw.ai as Record<string, unknown> | undefined) || {};
  const storage = (raw.storage as Record<string, unknown> | undefined) || {};
  return {
    mode,
    database: { kind: database.kind === 'sqlite' ? 'sqlite' : 'platform', file: typeof database.file === 'string' ? database.file : undefined },
    auth: { kind: auth.kind === 'local' ? 'local' : 'platform', ownerId: typeof auth.ownerId === 'string' ? auth.ownerId : undefined },
    ai: { provider: ai.provider === 'external' ? 'external' : 'builtin' },
    storage: { kind: storage.kind === 'local' ? 'local' : 'platform', root: typeof storage.root === 'string' ? storage.root : undefined },
  };
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function isLocalRuntime(): boolean {
  try {
    return normalizeRuntimeConfig(JSON.parse(readFileSync(join(process.cwd(), '.runtime-config.json'), 'utf8'))).mode === 'local';
  } catch {
    return false;
  }
}
