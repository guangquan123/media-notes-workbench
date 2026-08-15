import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import { DatabaseModule } from '../../server/database/database.module';

const DATABASE_CONSUMER = Symbol('DATABASE_CONSUMER');

@Module({
  providers: [
    {
      provide: DATABASE_CONSUMER,
      inject: [DRIZZLE_DATABASE],
      useFactory: (database: unknown): unknown => database,
    },
  ],
})
class ConsumerModule {}

describe('local database dependency wiring', () => {
  const originalCwd = process.cwd();
  let runtimeDir: string;
  let moduleRef: TestingModule | undefined;

  beforeEach(async () => {
    runtimeDir = await mkdtemp(join(tmpdir(), 'media-notes-local-app-'));
    await writeFile(
      join(runtimeDir, '.runtime-config.json'),
      JSON.stringify({
        mode: 'local',
        database: { kind: 'sqlite', file: 'data/workbench.sqlite' },
        auth: { kind: 'local', ownerId: 'local-user' },
        ai: { provider: 'external' },
        storage: { kind: 'local', root: 'data/storage' },
      }),
      'utf8',
    );
    process.chdir(runtimeDir);
  });

  afterEach(async () => {
    await moduleRef?.close();
    process.chdir(originalCwd);
    await rm(runtimeDir, { recursive: true, force: true });
  });

  it('makes the local database available to sibling feature modules', async () => {
    const databaseStub = {};
    const moduleBuilder = Test.createTestingModule({
      imports: [DatabaseModule.forRoot(), ConsumerModule],
    });

    moduleRef = await moduleBuilder
      .overrideProvider(DRIZZLE_DATABASE)
      .useValue(databaseStub)
      .compile();

    expect(moduleRef.get(DATABASE_CONSUMER)).toBe(databaseStub);
  });
});
