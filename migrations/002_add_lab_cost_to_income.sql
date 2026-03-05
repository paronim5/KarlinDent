-- Add lab_cost column to income_records
ALTER TABLE income_records ADD COLUMN lab_cost NUMERIC(12, 2) NOT NULL DEFAULT 0;
