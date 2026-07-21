ALTER TABLE note_conversion_records
  ADD COLUMN IF NOT EXISTS source_channel varchar(32) NOT NULL DEFAULT 'manual';

UPDATE note_conversion_records AS record
SET source_channel = 'feishu_inbox'
FROM note_inbox_media AS media
WHERE media.job_id = record.job_id;
