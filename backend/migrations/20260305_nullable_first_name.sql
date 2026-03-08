BEGIN;
ALTER TABLE patients ALTER COLUMN first_name DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_last_first ON patients (LOWER(last_name), COALESCE(LOWER(first_name), ''));
COMMIT;
