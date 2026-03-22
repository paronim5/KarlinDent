-- ============================================================
-- SHIFTS
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
    id              SERIAL PRIMARY KEY,
    staff_id        INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster range queries
CREATE INDEX IF NOT EXISTS idx_shifts_time ON shifts (start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_shifts_staff ON shifts (staff_id);

-- ============================================================
-- SCHEDULE AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS schedule_audit_logs (
    id              SERIAL PRIMARY KEY,
    shift_id        INT,  -- Keep ID even if shift is deleted, or set NULL
    action          VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
    changed_by      INT REFERENCES staff(id), -- Administrator who made the change
    details         TEXT, -- JSON string of changes
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_audit_logs_shift ON schedule_audit_logs (shift_id);
