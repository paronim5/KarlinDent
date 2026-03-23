CREATE TABLE IF NOT EXISTS staff_timesheets (
    id         SERIAL PRIMARY KEY,
    staff_id   INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    work_date  DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time   TIME NOT NULL,
    hours      NUMERIC(6,2) NOT NULL DEFAULT 0,
    note       TEXT
);

CREATE INDEX IF NOT EXISTS idx_staff_timesheets_staff   ON staff_timesheets (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_timesheets_date    ON staff_timesheets (work_date);
