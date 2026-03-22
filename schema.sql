-- ============================================================
-- POLICLINIC DATABASE SCHEMA
-- PostgreSQL
-- ============================================================

-- Drop tables if they exist (for clean re-runs)
DROP TABLE IF EXISTS income_records CASCADE;
DROP TABLE IF EXISTS outcome_records CASCADE;
DROP TABLE IF EXISTS outcome_categories CASCADE;
DROP TABLE IF EXISTS salary_payments CASCADE;
DROP TABLE IF EXISTS staff_documents CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS staff_roles CASCADE;
DROP TABLE IF EXISTS clinic_settings CASCADE;
DROP TABLE IF EXISTS clinic_expenses CASCADE;

-- ============================================================
-- STAFF ROLES (lookup table)
-- ============================================================
CREATE TABLE staff_roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE  -- 'doctor', 'assistant', 'administrator', 'janitor'
);

INSERT INTO staff_roles (name) VALUES
    ('doctor'),
    ('assistant'),
    ('administrator'),
    ('janitor');

-- ============================================================
-- STAFF
-- ============================================================
CREATE TABLE staff (
    id                  SERIAL PRIMARY KEY,
    role_id             INT NOT NULL REFERENCES staff_roles(id),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    phone               VARCHAR(30),
    email               VARCHAR(150) UNIQUE,
    bio                 TEXT,
    -- Salary info
    base_salary         NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- base or hourly rate for non-doctors
    weekend_salary      NUMERIC(12, 2) NOT NULL DEFAULT 200, -- weekend hourly rate for non-doctors
    commission_rate     NUMERIC(5, 4) NOT NULL DEFAULT 0,   -- doctors: share of income (0.30 = 30%)
    last_paid_at        DATE,                                -- date of last salary payment
    -- Doctors only: cumulative revenue brought to clinic
    total_revenue       NUMERIC(14, 2) NOT NULL DEFAULT 0,
    -- Meta
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SALARY PAYMENTS  (Outcome sub-type: staff salaries)
-- ============================================================
CREATE TABLE salary_payments (
    id              SERIAL PRIMARY KEY,
    staff_id        INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    amount          NUMERIC(12, 2) NOT NULL,
    payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: update staff.last_paid_at after a salary payment
CREATE OR REPLACE FUNCTION update_last_paid_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE staff
    SET last_paid_at = NEW.payment_date,
        updated_at   = NOW()
    WHERE id = NEW.staff_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_salary_payment_after_insert
AFTER INSERT ON salary_payments
FOR EACH ROW EXECUTE FUNCTION update_last_paid_at();

-- ============================================================
-- STAFF DOCUMENTS (signed salary reports)
-- ============================================================
CREATE TABLE staff_documents (
    id              SERIAL PRIMARY KEY,
    staff_id        INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    document_type   VARCHAR(60) NOT NULL,
    period_from     DATE,
    period_to       DATE,
    signed_at       TIMESTAMPTZ,
    signer_name     VARCHAR(150) NOT NULL,
    signature_hash  VARCHAR(64) NOT NULL,
    signature_token VARCHAR(64),
    file_path       TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staff_documents_staff ON staff_documents(staff_id);
CREATE INDEX idx_staff_documents_type ON staff_documents(document_type);
CREATE INDEX idx_staff_documents_period ON staff_documents(period_from, period_to);
CREATE INDEX idx_staff_documents_signed_at ON staff_documents(signed_at);

-- ============================================================
-- PATIENTS
-- ============================================================
CREATE TABLE patients (
    id              SERIAL PRIMARY KEY,
    first_name      VARCHAR(100), -- Now nullable
    last_name       VARCHAR(100) NOT NULL,
    phone           VARCHAR(30),
    street_address  VARCHAR(255),
    city            VARCHAR(50),
    zip_code        VARCHAR(10),
    email           VARCHAR(150),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_patients_last_first_name ON patients (last_name, first_name);

-- ============================================================
-- INCOME RECORDS  (/Income page)
-- ============================================================
CREATE TABLE income_records (
    id              SERIAL PRIMARY KEY,
    patient_id      INT NOT NULL REFERENCES patients(id),
    doctor_id       INT NOT NULL REFERENCES staff(id),   -- must be role=doctor
    amount          NUMERIC(12, 2) NOT NULL,
    lab_cost        NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_method  VARCHAR(10) NOT NULL CHECK (payment_method IN ('cash', 'card')),
    service_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: keep staff.total_revenue up to date for doctors
CREATE OR REPLACE FUNCTION update_doctor_total_revenue()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE staff
    SET total_revenue = total_revenue + NEW.amount,
        updated_at    = NOW()
    WHERE id = NEW.doctor_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_income_after_insert
AFTER INSERT ON income_records
FOR EACH ROW EXECUTE FUNCTION update_doctor_total_revenue();

-- ============================================================
-- OUTCOME CATEGORIES  (materials, rent, utilities, etc.)
-- ============================================================
CREATE TABLE outcome_categories (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(100) NOT NULL UNIQUE   -- e.g. 'materials', 'rent', 'utilities'
);

INSERT INTO outcome_categories (name) VALUES
    ('materials'),
    ('rent'),
    ('utilities'),
    ('equipment'),
    ('other');

-- ============================================================
-- MEDICINE PRESETS
-- ============================================================
CREATE TABLE medicine_presets (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OUTCOME RECORDS  (/Outcome page — non-salary expenses)
-- ============================================================
CREATE TABLE outcome_records (
    id              SERIAL PRIMARY KEY,
    category_id     INT NOT NULL REFERENCES outcome_categories(id),
    amount          NUMERIC(12, 2) NOT NULL,
    expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CLINIC SETTINGS  (/Clinic page — static config values)
-- ============================================================
CREATE TABLE clinic_settings (
    id              SERIAL PRIMARY KEY,
    setting_key     VARCHAR(100) NOT NULL UNIQUE,   -- e.g. 'lease_cost'
    setting_value   NUMERIC(14, 2),
    description     TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO clinic_settings (setting_key, description) VALUES
    ('monthly_lease_cost',          'Monthly rent/lease cost for clinic premises'),
    ('avg_doctor_salary',           'Average monthly salary for doctors'),
    ('avg_assistant_salary',        'Average monthly salary for assistants'),
    ('avg_administrator_salary',    'Average monthly salary for administrators'),
    ('avg_janitor_salary',          'Average monthly salary for janitors');

-- ============================================================
-- HELPFUL VIEWS
-- ============================================================

-- Daily P&L view (used by calendar on /Clinic)
CREATE OR REPLACE VIEW daily_pnl AS
SELECT
    d::DATE AS day,
    COALESCE(inc.total_income, 0)  AS total_income,
    COALESCE(out.total_outcome, 0) + COALESCE(sal.total_salaries, 0) AS total_outcome,
    COALESCE(inc.total_income, 0)
        - COALESCE(out.total_outcome, 0)
        - COALESCE(sal.total_salaries, 0) AS pnl
FROM
    generate_series(
        (SELECT MIN(LEAST(service_date, expense_date)) FROM
            (SELECT MIN(service_date) AS service_date, NULL::DATE AS expense_date FROM income_records
             UNION ALL
             SELECT NULL, MIN(expense_date) FROM outcome_records) sub),
        CURRENT_DATE,
        '1 day'::INTERVAL
    ) d
LEFT JOIN (
    SELECT service_date AS day, SUM(amount) AS total_income
    FROM income_records
    GROUP BY service_date
) inc ON inc.day = d::DATE
LEFT JOIN (
    SELECT expense_date AS day, SUM(amount) AS total_outcome
    FROM outcome_records
    GROUP BY expense_date
) out ON out.day = d::DATE
LEFT JOIN (
    SELECT payment_date AS day, SUM(amount) AS total_salaries
    FROM salary_payments
    GROUP BY payment_date
) sal ON sal.day = d::DATE;

-- Average payment per patient visit
CREATE OR REPLACE VIEW avg_patient_payment AS
SELECT
    ROUND(AVG(amount), 2) AS avg_payment
FROM income_records;

-- Average salary per role
CREATE OR REPLACE VIEW avg_salary_by_role AS
SELECT
    r.name AS role,
    ROUND(AVG(s.base_salary), 2) AS avg_salary
FROM staff s
JOIN staff_roles r ON r.id = s.role_id
WHERE s.is_active = TRUE
GROUP BY r.name;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_income_service_date  ON income_records(service_date);
CREATE INDEX idx_income_doctor        ON income_records(doctor_id);
CREATE INDEX idx_outcome_expense_date ON outcome_records(expense_date);
CREATE INDEX idx_salary_payment_date  ON salary_payments(payment_date);
CREATE INDEX idx_staff_role           ON staff(role_id);
