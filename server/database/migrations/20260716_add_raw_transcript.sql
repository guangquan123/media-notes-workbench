ALTER TABLE note_conversion_records
  ADD COLUMN IF NOT EXISTS raw_transcript TEXT;
