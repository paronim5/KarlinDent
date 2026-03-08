-- Add salary_payment_id to income_records
ALTER TABLE income_records
ADD COLUMN salary_payment_id INT REFERENCES salary_payments(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_income_salary_payment ON income_records(salary_payment_id);

-- Create salary_adjustments table
CREATE TABLE salary_adjustments (
    id                          SERIAL PRIMARY KEY,
    staff_id                    INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    amount                      NUMERIC(12, 2) NOT NULL,
    reason                      TEXT,
    applied_to_salary_payment_id INT REFERENCES salary_payments(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_salary_adjustments_staff ON salary_adjustments(staff_id);
CREATE INDEX idx_salary_adjustments_applied ON salary_adjustments(applied_to_salary_payment_id);

-- Migrate existing data: Link income_records to salary_payments based on the note
UPDATE income_records ir
SET salary_payment_id = sp.id
FROM salary_payments sp
WHERE sp.note = 'Commission from income #' || ir.id;
