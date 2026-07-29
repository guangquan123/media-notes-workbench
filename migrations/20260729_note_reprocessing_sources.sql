ALTER TABLE note_conversion_records
  ADD COLUMN IF NOT EXISTS source_asset_group_id uuid NOT NULL
    DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS source_snapshot_json text,
  ADD COLUMN IF NOT EXISTS source_deleted_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS parent_job_id uuid,
  ADD COLUMN IF NOT EXISTS rerun_mode varchar(32) NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS note_conversion_records_owner_source_group_idx
  ON note_conversion_records(owner_id, source_asset_group_id, version_number);

CREATE INDEX IF NOT EXISTS note_conversion_records_parent_job_idx
  ON note_conversion_records(parent_job_id);

CREATE UNIQUE INDEX IF NOT EXISTS
  note_conversion_records_owner_source_group_version_key
  ON note_conversion_records(owner_id, source_asset_group_id, version_number);
