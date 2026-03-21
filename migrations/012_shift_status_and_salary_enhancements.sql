ALTER TABLE shifts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES staff(id);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS completion_percent NUMERIC(5, 2) NOT NULL DEFAULT 100;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS pay_multiplier NUMERIC(6, 3) NOT NULL DEFAULT 1.0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS salary_payment_id INT REFERENCES salary_payments(id);

UPDATE shifts SET status = 'pending' WHERE status IS NULL OR status NOT IN ('pending', 'accepted', 'declined');
UPDATE shifts SET completion_percent = 100 WHERE completion_percent IS NULL;
UPDATE shifts SET pay_multiplier = 1.0 WHERE pay_multiplier IS NULL OR pay_multiplier <= 0;

CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_payment ON shifts(salary_payment_id);
