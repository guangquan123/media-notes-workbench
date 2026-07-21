CREATE TABLE IF NOT EXISTS note_inbox_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id varchar(255) NOT NULL UNIQUE,
  chat_id varchar(255) NOT NULL,
  lark_user_id varchar(255) NOT NULL,
  note_style varchar(32) NOT NULL DEFAULT 'learning',
  is_enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS note_inbox_bindings_owner_chat_key
  ON note_inbox_bindings (owner_id, chat_id);

CREATE TABLE IF NOT EXISTS note_inbox_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id varchar(255) NOT NULL,
  platform varchar(32) NOT NULL,
  canonical_key varchar(1024) NOT NULL,
  canonical_url text NOT NULL,
  title varchar(255),
  status varchar(32) NOT NULL DEFAULT 'QUEUED',
  job_id uuid UNIQUE,
  note_style varchar(32) NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS note_inbox_media_owner_source_key
  ON note_inbox_media (owner_id, platform, canonical_key);

CREATE INDEX IF NOT EXISTS note_inbox_media_owner_status_created_idx
  ON note_inbox_media (owner_id, status, created_at DESC);

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
  message_created_at timestamptz,
  duplicate_of_message_id varchar(255),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS note_inbox_messages_binding_message_key
  ON note_inbox_messages (binding_id, message_id);

CREATE INDEX IF NOT EXISTS note_inbox_messages_owner_created_idx
  ON note_inbox_messages (owner_id, message_created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS note_inbox_messages_owner_status_created_idx
  ON note_inbox_messages (owner_id, status, message_created_at DESC);
