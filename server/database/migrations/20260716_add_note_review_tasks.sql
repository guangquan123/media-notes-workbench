ALTER TABLE note_conversion_records
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lark_task_guid VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lark_task_url TEXT,
  ADD COLUMN IF NOT EXISTS task_sync_status VARCHAR(32) NOT NULL DEFAULT 'not_created',
  ADD COLUMN IF NOT EXISTS task_sync_error TEXT;

CREATE INDEX IF NOT EXISTS note_conversion_records_owner_processing_idx
  ON note_conversion_records (owner_id, processing_status, started_at DESC);
