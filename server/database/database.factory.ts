import { drizzle } from 'drizzle-orm/pglite';
import { mkdirSync } from 'node:fs';
import * as schema from './schema';
import type { AppDatabase } from './database.types';

export function createLocalDatabase(dataDir = 'data/pgdata'): AppDatabase {
  mkdirSync(dataDir, { recursive: true });
  const db = drizzle({ schema, connection: { dataDir } });
  return db as unknown as AppDatabase;
}
