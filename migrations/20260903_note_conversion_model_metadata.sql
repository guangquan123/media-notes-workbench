ALTER TABLE note_conversion_records
  ADD COLUMN IF NOT EXISTS transcription_model varchar(255),
  ADD COLUMN IF NOT EXISTS transcription_provider_name varchar(255),
  ADD COLUMN IF NOT EXISTS summary_generation_json text;
