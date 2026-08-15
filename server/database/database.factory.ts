import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { mkdirSync } from 'node:fs';
import * as schema from './schema';
import type { AppDatabase } from './database.types';
import { LOCAL_DATABASE_SCHEMA_SQL } from './local-schema';

export async function createLocalDatabase(dataDir = 'data/pgdata'): Promise<AppDatabase> {
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);

  try {
    await client.exec(LOCAL_DATABASE_SCHEMA_SQL);
    return drizzle(client, { schema }) as unknown as AppDatabase;
  } catch (error) {
    await client.close();
    throw error;
  }
}
