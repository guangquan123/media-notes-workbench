CREATE TABLE IF NOT EXISTS note_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id user_profile NOT NULL,
  note_style VARCHAR(32) NOT NULL,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_id, note_style, version_number)
);

CREATE INDEX IF NOT EXISTS note_template_versions_owner_style_idx
  ON note_template_versions (owner_id, note_style, version_number DESC);

ALTER TABLE note_template_configs
  ADD COLUMN IF NOT EXISTS draft_content TEXT,
  ADD COLUMN IF NOT EXISTS active_version_id UUID;

INSERT INTO note_template_versions (
  owner_id,
  note_style,
  version_number,
  content,
  published_at,
  created_at
)
SELECT
  config.owner_id,
  config.note_style,
  1,
  config.content,
  config.updated_at,
  config.created_at
FROM note_template_configs config
WHERE NOT EXISTS (
  SELECT 1
  FROM note_template_versions version
  WHERE version.owner_id = config.owner_id
    AND version.note_style = config.note_style
);

UPDATE note_template_configs config
SET
  draft_content = COALESCE(config.draft_content, config.content),
  active_version_id = version.id
FROM note_template_versions version
WHERE version.owner_id = config.owner_id
  AND version.note_style = config.note_style
  AND version.version_number = 1
  AND config.active_version_id IS NULL;

ALTER TABLE note_conversion_records
  ADD COLUMN IF NOT EXISTS note_style VARCHAR(32),
  ADD COLUMN IF NOT EXISTS prompt_version_id UUID,
  ADD COLUMN IF NOT EXISTS prompt_content TEXT;
