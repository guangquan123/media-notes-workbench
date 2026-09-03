import { LOCAL_DATABASE_SCHEMA_SQL } from '../../server/database/local-schema';

describe('local database schema', () => {
  it('contains idempotent upgrades for conversion metadata columns', () => {
    expect(LOCAL_DATABASE_SCHEMA_SQL).toContain(
      'ADD COLUMN IF NOT EXISTS transcription_model varchar(255)',
    );
    expect(LOCAL_DATABASE_SCHEMA_SQL).toContain(
      'ADD COLUMN IF NOT EXISTS transcription_provider_name varchar(255)',
    );
    expect(LOCAL_DATABASE_SCHEMA_SQL).toContain(
      'ADD COLUMN IF NOT EXISTS summary_generation_json text',
    );
  });
});
