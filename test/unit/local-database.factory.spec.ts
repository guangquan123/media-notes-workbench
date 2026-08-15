import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalDatabase } from '../../server/database/database.factory';
import { noteTemplateConfigs } from '../../server/database/schema';
import type { AppDatabase } from '../../server/database/database.types';

jest.setTimeout(30_000);

function getClient(database: AppDatabase): PGlite {
  return (database as unknown as { $client: PGlite }).$client;
}

describe('local database factory', () => {
  let dataDir: string;
  let database: AppDatabase | undefined;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'media-notes-local-db-'));
  });

  afterEach(async () => {
    if (database) {
      await getClient(database).close();
      database = undefined;
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  it('initializes the schema idempotently and preserves existing data', async () => {
    database = await createLocalDatabase(dataDir);
    await database.insert(noteTemplateConfigs).values({
      ownerId: 'local-user',
      noteStyle: 'learning',
      content: 'Initial template',
    });

    const firstRead = await database
      .select()
      .from(noteTemplateConfigs)
      .where(eq(noteTemplateConfigs.ownerId, 'local-user'));
    expect(firstRead).toHaveLength(1);
    expect(firstRead[0]?.ownerId).toBe('local-user');

    await getClient(database).close();
    database = undefined;

    database = await createLocalDatabase(dataDir);
    const reopenedRead = await database
      .select()
      .from(noteTemplateConfigs)
      .where(eq(noteTemplateConfigs.ownerId, 'local-user'));

    expect(reopenedRead).toHaveLength(1);
    expect(reopenedRead[0]?.content).toBe('Initial template');
  });
});
