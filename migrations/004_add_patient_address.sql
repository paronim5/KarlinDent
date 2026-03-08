-- Add address columns to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS street_address VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);
