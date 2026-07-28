ALTER TABLE note_conversion_records
  ADD COLUMN IF NOT EXISTS visual_options_json text,
  ADD COLUMN IF NOT EXISTS visual_summary_json text,
  ADD COLUMN IF NOT EXISTS draft_markdown text,
  ADD COLUMN IF NOT EXISTS frame_selection_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_stage varchar(48),
  ADD COLUMN IF NOT EXISTS progress integer,
  ADD COLUMN IF NOT EXISTS status_message text;

CREATE TABLE IF NOT EXISTS note_job_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  owner_id user_profile NOT NULL,
  source_index integer NOT NULL DEFAULT 0,
  source_file_name varchar(255) NOT NULL,
  timestamp_ms integer NOT NULL,
  global_timestamp_ms integer NOT NULL,
  extraction_type varchar(16) NOT NULL,
  original_asset_ref text,
  perceptual_hash varchar(32),
  analysis_json text,
  scores_json text,
  selection_status varchar(16) NOT NULL DEFAULT 'candidate',
  selected_by varchar(16),
  display_order integer,
  derivative_asset_ref text,
  derivative_status varchar(24) NOT NULL DEFAULT 'not_requested',
  failure_code varchar(64),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS note_job_frames_job_source_time_type_key
  ON note_job_frames(job_id, source_index, timestamp_ms, extraction_type);
CREATE INDEX IF NOT EXISTS note_job_frames_job_time_idx
  ON note_job_frames(job_id, global_timestamp_ms);
CREATE INDEX IF NOT EXISTS note_job_frames_job_status_idx
  ON note_job_frames(job_id, selection_status, display_order);
CREATE INDEX IF NOT EXISTS note_job_frames_owner_job_idx
  ON note_job_frames(owner_id, job_id);
