export const LOCAL_DATABASE_SCHEMA_SQL = `
BEGIN;

DO $$
BEGIN
  CREATE TYPE user_profile AS (user_id varchar(255));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS note_inbox_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id varchar(255) NOT NULL,
  chat_id varchar(255) NOT NULL,
  lark_user_id varchar(255) NOT NULL,
  note_style varchar(32) NOT NULL DEFAULT 'learning',
  is_enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz(6),
  last_sync_error text,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS note_inbox_bindings_owner_id_key
  ON note_inbox_bindings(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS note_inbox_bindings_owner_chat_key
  ON note_inbox_bindings(owner_id, chat_id);

CREATE TABLE IF NOT EXISTS note_inbox_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id varchar(255) NOT NULL,
  platform varchar(32) NOT NULL,
  canonical_key varchar(1024) NOT NULL,
  canonical_url text NOT NULL,
  title varchar(255),
  status varchar(32) NOT NULL DEFAULT 'QUEUED',
  job_id uuid,
  note_style varchar(32) NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS note_inbox_media_job_id_key
  ON note_inbox_media(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS note_inbox_media_owner_source_key
  ON note_inbox_media(owner_id, platform, canonical_key);
CREATE INDEX IF NOT EXISTS note_inbox_media_owner_status_created_idx
  ON note_inbox_media(owner_id, status, created_at);

CREATE TABLE IF NOT EXISTS note_inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL REFERENCES note_inbox_bindings(id),
  media_id uuid REFERENCES note_inbox_media(id),
  owner_id varchar(255) NOT NULL,
  message_id varchar(255) NOT NULL,
  sender_lark_user_id varchar(255),
  message_content text NOT NULL,
  subject varchar(255) NOT NULL,
  original_url text,
  platform varchar(32),
  status varchar(32) NOT NULL,
  status_reason varchar(512),
  message_created_at timestamptz(6),
  duplicate_of_message_id varchar(255),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS note_inbox_messages_binding_message_key
  ON note_inbox_messages(binding_id, message_id);
CREATE INDEX IF NOT EXISTS note_inbox_messages_owner_created_idx
  ON note_inbox_messages(owner_id, message_created_at, id);
CREATE INDEX IF NOT EXISTS note_inbox_messages_owner_status_created_idx
  ON note_inbox_messages(owner_id, status, message_created_at);

CREATE TABLE IF NOT EXISTS note_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id user_profile NOT NULL,
  note_style varchar(32) NOT NULL,
  version_number integer NOT NULL,
  content text NOT NULL,
  published_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS note_template_versions_owner_id_note_style_version_number_key
  ON note_template_versions(owner_id, note_style, version_number);
CREATE INDEX IF NOT EXISTS note_template_versions_owner_style_idx
  ON note_template_versions(owner_id, note_style, version_number);

CREATE TABLE IF NOT EXISTS note_template_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id user_profile NOT NULL,
  note_style varchar(32) NOT NULL,
  content text NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  draft_content text,
  active_version_id uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS note_template_configs_owner_style_key
  ON note_template_configs(owner_id, note_style);
CREATE INDEX IF NOT EXISTS note_template_configs_owner_idx
  ON note_template_configs(owner_id);

CREATE TABLE IF NOT EXISTS note_conversion_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  owner_id user_profile NOT NULL,
  title varchar(255) NOT NULL,
  source_type varchar(32) NOT NULL,
  source_label varchar(64) NOT NULL,
  status varchar(32) NOT NULL,
  duration_ms integer,
  started_at timestamptz(6) NOT NULL,
  completed_at timestamptz(6),
  document_url text,
  error text,
  raw_document_url text,
  raw_transcript text,
  transcription_model varchar(255),
  transcription_provider_name varchar(255),
  summary_generation_json text,
  note_style varchar(32),
  prompt_version_id uuid,
  prompt_content text,
  processing_status varchar(32) NOT NULL DEFAULT 'pending',
  processed_at timestamptz(6),
  lark_task_guid varchar(255),
  lark_task_url text,
  task_sync_status varchar(32) NOT NULL DEFAULT 'not_created',
  task_sync_error text,
  source_channel varchar(32) NOT NULL DEFAULT 'manual',
  visual_options_json text,
  visual_summary_json text,
  draft_markdown text,
  frame_selection_revision integer NOT NULL DEFAULT 0,
  current_stage varchar(48),
  progress integer,
  status_message text,
  source_asset_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_snapshot_json text,
  source_deleted_at timestamptz(6),
  parent_job_id uuid,
  rerun_mode varchar(32) NOT NULL DEFAULT 'initial',
  version_number integer NOT NULL DEFAULT 1,
  _created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE note_conversion_records
  ADD COLUMN IF NOT EXISTS transcription_model varchar(255),
  ADD COLUMN IF NOT EXISTS transcription_provider_name varchar(255),
  ADD COLUMN IF NOT EXISTS summary_generation_json text;
CREATE UNIQUE INDEX IF NOT EXISTS note_conversion_records_job_id_key
  ON note_conversion_records(job_id);
CREATE INDEX IF NOT EXISTS note_conversion_records_owner_completed_idx
  ON note_conversion_records(owner_id, completed_at, started_at);
CREATE INDEX IF NOT EXISTS note_conversion_records_owner_processing_idx
  ON note_conversion_records(owner_id, processing_status, started_at);
CREATE INDEX IF NOT EXISTS note_conversion_records_owner_source_group_idx
  ON note_conversion_records(owner_id, source_asset_group_id, version_number);
CREATE INDEX IF NOT EXISTS note_conversion_records_parent_job_idx
  ON note_conversion_records(parent_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS note_conversion_records_owner_source_group_version_key
  ON note_conversion_records(owner_id, source_asset_group_id, version_number);

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

COMMIT;
`;
