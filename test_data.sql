-- ============================================================
--  KarlinDent / Virex -- Showcase Test Data
--  6 months of realistic dental clinic data (Oct 2025 - Mar 2026)
--  All text is ASCII-only (no accented or special characters)
-- ============================================================
--
--  STAFF ACCOUNTS (set passwords after load -- see bottom)
--    Dr. James Porter       james.porter@karlindent.cz     (doctor)
--    Dr. Sarah Mitchell     sarah.mitchell@karlindent.cz   (doctor)
--    Emily Carter           emily.carter@karlindent.cz     (assistant)
--    David Brown            david.brown@karlindent.cz      (assistant)
--    Laura Wilson           laura.wilson@karlindent.cz     (admin)
--
-- ============================================================

BEGIN;

-- ── 1. Roles ────────────────────────────────────────────────
INSERT INTO staff_roles (id, name) VALUES
  (1, 'doctor'),
  (2, 'assistant'),
  (3, 'administrator'),
  (4, 'janitor')
ON CONFLICT (name) DO NOTHING;

-- ── 2. Outcome Categories ───────────────────────────────────
INSERT INTO outcome_categories (id, name) VALUES
  (1, 'materials'),
  (2, 'rent'),
  (3, 'utilities'),
  (4, 'equipment'),
  (5, 'other'),
  (6, 'salary')
ON CONFLICT (name) DO NOTHING;

-- ── 3. Clinic Settings ──────────────────────────────────────
INSERT INTO clinic_settings (setting_key, setting_value, description) VALUES
  ('monthly_lease_cost',        55000, 'Monthly rent - Jecna 10, Praha 2'),
  ('avg_doctor_salary',         85000, 'Average doctor monthly salary'),
  ('avg_assistant_salary',      37000, 'Average assistant monthly salary'),
  ('avg_administrator_salary',  46000, 'Average administrator monthly salary'),
  ('avg_janitor_salary',        29000, 'Average janitor monthly salary')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- ── 4. Staff ────────────────────────────────────────────────
INSERT INTO staff (id, role_id, first_name, last_name, phone, email, bio,
                   base_salary, commission_rate, weekend_salary, is_active) VALUES
  (1, 1, 'James',  'Porter',   '+420 776 100 001', 'james.porter@karlindent.cz',
   'Senior dentist with 14 years of experience. Specialises in implantology and aesthetic dentistry.',
   92000, 0.15, 250, true),
  (2, 1, 'Sarah',  'Mitchell', '+420 776 100 002', 'sarah.mitchell@karlindent.cz',
   'General dentist focusing on paediatric dentistry and preventive care.',
   76000, 0.12, 200, true),
  (3, 2, 'Emily',  'Carter',   '+420 776 100 003', 'emily.carter@karlindent.cz',
   'Dental assistant with 7 years of clinical experience.',
   38000, 0.00, 180, true),
  (4, 2, 'David',  'Brown',    '+420 776 100 004', 'david.brown@karlindent.cz',
   'Dental assistant and front-desk receptionist.',
   35000, 0.00, 180, true),
  (5, 3, 'Laura',  'Wilson',   '+420 776 100 005', 'laura.wilson@karlindent.cz',
   'Clinic administrator. Manages billing, scheduling, and staff coordination.',
   46000, 0.00, 200, true)
ON CONFLICT (email) DO NOTHING;

-- ── 5. Medicine Presets ─────────────────────────────────────
INSERT INTO medicine_presets (name) VALUES
  ('Ubistesin 1:200 000 (4% Articaine)'),
  ('Septanest 1:100 000 (4% Articaine)'),
  ('Lidocaine 2% with adrenaline'),
  ('Amoxicillin 500 mg'),
  ('Metronidazole 400 mg'),
  ('Ibuprofen 400 mg'),
  ('Paracetamol 500 mg'),
  ('Chlorhexidine 0.12% mouthwash'),
  ('Ketoprofen gel'),
  ('Dexamethasone 4 mg')
ON CONFLICT (name) DO NOTHING;

-- ── 6. Patients ─────────────────────────────────────────────
INSERT INTO patients (id, first_name, last_name, phone, email, street_address, city, zip_code) VALUES
  ( 1, 'Peter',    'Harrison',  '+420 601 200 001', 'peter.harrison@email.com',   'Namesti Miru 12',  'Praha 2', '12000'),
  ( 2, 'Lucy',     'Morrison',  '+420 601 200 002', 'lucy.morrison@email.com',    'Blanicka 5',       'Praha 2', '12000'),
  ( 3, 'Martin',   'Bennett',   '+420 601 200 003', 'martin.bennett@email.com',   'Manesova 33',      'Praha 2', '12000'),
  ( 4, 'Eva',      'Douglas',   '+420 601 200 004', 'eva.douglas@email.com',      'Jecna 18',         'Praha 2', '12000'),
  ( 5, 'Jake',     'Holland',   '+420 601 200 005', 'jake.holland@email.com',     'Korunni 7',        'Praha 2', '12000'),
  ( 6, 'Teresa',   'Newman',    '+420 601 200 006', 'teresa.newman@email.com',    'Vinohrady 44',     'Praha 2', '12000'),
  ( 7, 'Andrew',   'Blake',     '+420 601 200 007', 'andrew.blake@email.com',     'Zitna 9',          'Praha 1', '11000'),
  ( 8, 'Veronica', 'Palmer',    '+420 601 200 008', 'veronica.palmer@email.com',  'Hellichova 2',     'Praha 1', '11800'),
  ( 9, 'George',   'Simpson',   '+420 601 200 009', 'george.simpson@email.com',   'Wenzigova 6',      'Praha 2', '12000'),
  (10, 'Barbara',  'Fletcher',  '+420 601 200 010', 'barbara.fletcher@email.com', 'Slezska 14',       'Praha 2', '12000'),
  (11, 'Robert',   'Spencer',   '+420 601 200 011', 'robert.spencer@email.com',   'Machova 22',       'Praha 2', '12000'),
  (12, 'Michelle', 'Crawford',  '+420 601 200 012', 'michelle.crawford@email.com','Polska 3',         'Praha 2', '12000'),
  (13, 'Thomas',   'Foster',    '+420 601 200 013', 'thomas.foster@email.com',    'Manesova 55',      'Praha 2', '12000'),
  (14, 'Hannah',   'Sutton',    '+420 601 200 014', 'hannah.sutton@email.com',    'Belgicka 30',      'Praha 2', '12000'),
  (15, 'Victor',   'Norris',    '+420 601 200 015', 'victor.norris@email.com',    'Anglicka 11',      'Praha 2', '12000'),
  (16, 'Simone',   'Greene',    '+420 601 200 016', 'simone.greene@email.com',    'Manesova 7',       'Praha 2', '12000'),
  (17, 'Philip',   'Lawson',    '+420 601 200 017', 'philip.lawson@email.com',    'Blanicka 21',      'Praha 2', '12000'),
  (18, 'Alena',    'Parker',    '+420 601 200 018', 'alena.parker@email.com',     'Korunni 38',       'Praha 2', '12000'),
  (19, 'Michael',  'Turner',    '+420 601 200 019', 'michael.turner@email.com',   'Londynska 4',      'Praha 2', '12000'),
  (20, 'Diana',    'Mason',     '+420 601 200 020', 'diana.mason@email.com',      'Jecna 44',         'Praha 2', '12000')
ON CONFLICT (id) DO NOTHING;

-- ── 7. Income Records (Oct 2025 – Mar 2026) ─────────────────
-- Dental fees: checkup ~800, filling ~2000-4000, root canal ~4000,
-- crown ~9000-13000, veneer ~8500, implant ~16000-18000 CZK
INSERT INTO income_records (patient_id, doctor_id, amount, lab_cost, payment_method, service_date, service_time, note) VALUES

-- ── October 2025 ──
  ( 1, 1, 12500,  800, 'card', '2025-10-02', '09:30', 'Crown placement - upper molar'),
  ( 2, 2,   900,    0, 'cash', '2025-10-02', '10:00', 'Regular check-up and cleaning'),
  ( 3, 1,  6800,  450, 'card', '2025-10-03', '11:00', 'Composite filling x3'),
  ( 4, 2,  1200,    0, 'card', '2025-10-06', '09:00', 'Whitening consultation'),
  ( 5, 1, 18000, 2200, 'card', '2025-10-07', '10:30', 'Dental implant - lower jaw'),
  ( 6, 2,   800,    0, 'cash', '2025-10-08', '14:00', 'Check-up and X-ray'),
  ( 7, 1,  4500,    0, 'card', '2025-10-09', '09:30', 'Root canal treatment'),
  ( 8, 2,  2800,  300, 'card', '2025-10-10', '11:30', 'Ceramic inlay'),
  ( 9, 1,   700,    0, 'cash', '2025-10-13', '10:00', 'Emergency extraction'),
  (10, 2,  5200,    0, 'card', '2025-10-14', '09:00', 'Teeth whitening - full set'),
  (11, 1, 13000, 1000, 'card', '2025-10-15', '10:00', 'Bridge work - 3 units'),
  (12, 2,   900,    0, 'cash', '2025-10-16', '11:00', 'Routine cleaning'),
  (13, 1,  3200,    0, 'card', '2025-10-17', '09:30', 'Composite filling x2'),
  (14, 2,  8900,  750, 'card', '2025-10-20', '10:30', 'Porcelain veneer x2'),
  (15, 1,   600,    0, 'cash', '2025-10-21', '14:00', 'Initial consultation'),
  ( 1, 2,  9500,  600, 'card', '2025-10-22', '09:00', 'Crown - lower premolar'),
  ( 3, 1,  1800,    0, 'card', '2025-10-23', '11:00', 'Filling replacement'),
  (16, 1,  4200,  350, 'card', '2025-10-24', '09:30', 'Composite veneer x2'),
  ( 5, 2,   700,    0, 'cash', '2025-10-27', '10:00', 'Post-implant check-up'),
  (17, 2,  2400,    0, 'card', '2025-10-28', '11:30', 'Root canal - lower molar'),
  (18, 1, 16200, 1900, 'card', '2025-10-29', '09:00', 'Implant + crown - upper jaw'),
  (19, 2,   850,    0, 'cash', '2025-10-30', '10:00', 'Regular check-up'),

-- ── November 2025 ──
  ( 2, 2,   850,    0, 'cash', '2025-11-03', '10:00', 'Routine check-up'),
  ( 7, 1, 16500, 1800, 'card', '2025-11-04', '09:30', 'Implant + crown - upper jaw'),
  ( 8, 2,  3400,    0, 'card', '2025-11-05', '11:00', 'Root canal treatment'),
  ( 9, 1,  2600,  200, 'card', '2025-11-06', '10:00', 'Filling x2 and X-ray'),
  (10, 2,  1100,    0, 'cash', '2025-11-07', '09:00', 'Scaling and polishing'),
  (11, 1,  6200,  480, 'card', '2025-11-10', '10:30', 'Porcelain inlay'),
  (12, 2,   800,    0, 'cash', '2025-11-11', '11:30', 'Check-up'),
  (13, 1, 11000,  900, 'card', '2025-11-12', '09:00', 'Crown x1 - full ceramic'),
  (14, 2,  5500,    0, 'card', '2025-11-13', '10:00', 'Teeth whitening'),
  (15, 1,  3800,    0, 'card', '2025-11-14', '09:30', 'Root canal'),
  (17, 2,  1300,    0, 'cash', '2025-11-17', '11:00', 'Emergency visit - pain'),
  (18, 1,  7800,  620, 'card', '2025-11-18', '10:00', 'Bridge work - 2 units'),
  (19, 2,   900,    0, 'cash', '2025-11-19', '09:30', 'Regular cleaning'),
  (20, 1,  4100,  300, 'card', '2025-11-20', '10:00', 'Composite filling x3'),
  ( 4, 2,  9200,  750, 'card', '2025-11-21', '09:00', 'Veneer x2 - upper front'),
  ( 6, 1,   750,    0, 'cash', '2025-11-24', '14:00', 'Consultation and X-ray'),
  ( 1, 2,  2200,    0, 'card', '2025-11-25', '10:30', 'Composite filling'),
  ( 3, 1, 14500, 1200, 'card', '2025-11-26', '09:00', 'Implant - lower molar'),
  ( 5, 2,   800,    0, 'cash', '2025-11-27', '11:00', 'Check-up'),
  (16, 1,  3500,  270, 'card', '2025-11-28', '09:30', 'Inlay - upper molar'),

-- ── December 2025 ──
  ( 2, 1,  5600,  400, 'card', '2025-12-01', '09:30', 'Ceramic crown - premolar'),
  ( 7, 2,  1100,    0, 'cash', '2025-12-02', '10:00', 'Routine cleaning'),
  ( 8, 1,  8800,  700, 'card', '2025-12-03', '09:00', 'Crown and root canal'),
  ( 9, 2,  4300,    0, 'card', '2025-12-04', '11:00', 'Teeth whitening'),
  (10, 1,  3700,  280, 'card', '2025-12-05', '10:30', 'Inlay - molar'),
  (11, 2,   900,    0, 'cash', '2025-12-08', '09:00', 'Check-up'),
  (12, 1, 17200, 2000, 'card', '2025-12-09', '10:00', 'Implant - upper jaw'),
  (13, 2,  2500,    0, 'card', '2025-12-10', '09:30', 'Composite filling x2'),
  (14, 1,  6100,  500, 'card', '2025-12-11', '11:00', 'Porcelain veneer'),
  (15, 2,   850,    0, 'cash', '2025-12-12', '10:00', 'Regular check-up'),
  (16, 1,  3200,    0, 'card', '2025-12-15', '09:30', 'Root canal'),
  (17, 2,  1600,    0, 'card', '2025-12-16', '10:30', 'Filling and cleaning'),
  (18, 1, 12800, 1100, 'card', '2025-12-17', '09:00', 'Bridge work'),
  (19, 2,  4800,  380, 'card', '2025-12-18', '10:00', 'Ceramic inlay'),
  (20, 1,   700,    0, 'cash', '2025-12-19', '11:00', 'Emergency extraction'),

-- ── January 2026 ──
  ( 1, 1, 11500,  850, 'card', '2026-01-05', '09:30', 'Crown replacement - upper molar'),
  ( 2, 2,   900,    0, 'cash', '2026-01-06', '10:00', 'Regular check-up and cleaning'),
  ( 3, 1,  7200,  500, 'card', '2026-01-07', '11:00', 'Composite filling x3 and X-ray'),
  ( 4, 2,  5300,    0, 'card', '2026-01-08', '09:00', 'Teeth whitening - full set'),
  ( 5, 1, 17800, 2100, 'card', '2026-01-09', '10:30', 'Dental implant - upper jaw'),
  ( 6, 2,   800,    0, 'cash', '2026-01-12', '14:00', 'Check-up and X-ray'),
  ( 7, 1,  4800,    0, 'card', '2026-01-13', '09:30', 'Root canal treatment'),
  ( 8, 2,  3100,  320, 'card', '2026-01-14', '11:30', 'Ceramic inlay - premolar'),
  ( 9, 1,   750,    0, 'cash', '2026-01-15', '10:00', 'Emergency extraction'),
  (10, 2,  2200,    0, 'card', '2026-01-16', '09:00', 'Composite filling x2'),
  (11, 1, 13200, 1050, 'card', '2026-01-19', '10:00', 'Bridge work - 3 units'),
  (12, 2,   950,    0, 'cash', '2026-01-20', '11:00', 'Routine cleaning'),
  (13, 1,  3400,    0, 'card', '2026-01-21', '09:30', 'Composite filling x2'),
  (14, 2,  9100,  780, 'card', '2026-01-22', '10:30', 'Porcelain veneer x2'),
  (15, 1,   650,    0, 'cash', '2026-01-23', '14:00', 'Consultation'),
  ( 1, 2,  9800,  620, 'card', '2026-01-26', '09:00', 'Crown - lower premolar'),
  ( 3, 1,  1900,    0, 'card', '2026-01-27', '11:00', 'Filling replacement'),
  (20, 2,   800,    0, 'cash', '2026-01-28', '10:00', 'Post-treatment check-up'),
  (16, 1,  4400,  360, 'card', '2026-01-29', '09:30', 'Composite veneer x2'),
  (17, 2,  1500,    0, 'card', '2026-01-30', '11:00', 'Scaling and polishing'),

-- ── February 2026 ──
  ( 4, 1,  8600,  690, 'card', '2026-02-02', '09:30', 'Porcelain veneer x2 - upper front'),
  ( 5, 2,   800,    0, 'cash', '2026-02-03', '10:00', 'Check-up'),
  ( 7, 1, 16800, 1850, 'card', '2026-02-04', '09:30', 'Implant + crown - lower jaw'),
  ( 8, 2,  3600,    0, 'card', '2026-02-05', '11:00', 'Root canal treatment'),
  ( 9, 1,  2700,  210, 'card', '2026-02-06', '10:00', 'Filling x2 and X-ray'),
  (10, 2,  1150,    0, 'cash', '2026-02-07', '09:00', 'Scaling and polishing'),
  (11, 1,  6400,  500, 'card', '2026-02-10', '10:30', 'Porcelain inlay'),
  (12, 2,   800,    0, 'cash', '2026-02-11', '11:30', 'Check-up'),
  (13, 1, 11500,  950, 'card', '2026-02-12', '09:00', 'Crown x1 - full ceramic'),
  (14, 2,  5700,    0, 'card', '2026-02-13', '10:00', 'Teeth whitening'),
  (15, 1,  3900,    0, 'card', '2026-02-14', '09:30', 'Root canal'),
  (18, 2,  1400,    0, 'cash', '2026-02-17', '11:00', 'Emergency visit - pain'),
  (19, 1,  8200,  650, 'card', '2026-02-18', '10:00', 'Bridge work - 2 units'),
  (20, 2,   950,    0, 'cash', '2026-02-19', '09:30', 'Regular cleaning'),
  ( 1, 1,  4300,  310, 'card', '2026-02-20', '10:00', 'Composite filling x3'),
  ( 6, 2,   750,    0, 'cash', '2026-02-23', '14:00', 'Consultation and X-ray'),
  ( 2, 1,  2300,    0, 'card', '2026-02-24', '10:30', 'Composite filling'),
  ( 3, 2, 15000, 1300, 'card', '2026-02-25', '09:00', 'Implant - lower molar'),
  (16, 1,   850,    0, 'cash', '2026-02-26', '11:00', 'Check-up'),
  (17, 2,  3200,  250, 'card', '2026-02-27', '09:30', 'Inlay - upper molar'),

-- ── March 2026 ──
  ( 2, 1,  5800,  420, 'card', '2026-03-02', '09:30', 'Ceramic crown - premolar'),
  ( 7, 2,  1100,    0, 'cash', '2026-03-03', '10:00', 'Routine cleaning'),
  ( 8, 1,  9100,  730, 'card', '2026-03-04', '09:00', 'Crown and root canal'),
  ( 9, 2,  4500,    0, 'card', '2026-03-05', '11:00', 'Teeth whitening'),
  (10, 1,  3800,  290, 'card', '2026-03-06', '10:30', 'Inlay - molar'),
  (11, 2,   900,    0, 'cash', '2026-03-10', '09:00', 'Check-up'),
  (12, 1, 17500, 2050, 'card', '2026-03-11', '10:00', 'Implant - upper jaw'),
  (13, 2,  2600,    0, 'card', '2026-03-12', '09:30', 'Composite filling x2'),
  (14, 1,  6300,  520, 'card', '2026-03-13', '11:00', 'Porcelain veneer'),
  (15, 2,   900,    0, 'cash', '2026-03-14', '10:00', 'Regular check-up'),
  (16, 1,  3300,    0, 'card', '2026-03-17', '09:30', 'Root canal'),
  (17, 2,  1700,    0, 'card', '2026-03-18', '10:30', 'Filling and cleaning'),
  (18, 1, 13200, 1150, 'card', '2026-03-19', '09:00', 'Bridge work'),
  (19, 2,  4900,  390, 'card', '2026-03-20', '10:00', 'Ceramic inlay'),
  (20, 1,   700,    0, 'cash', '2026-03-21', '11:00', 'Emergency extraction');

-- ── 8. Outcome Records (clinic expenses) ────────────────────
INSERT INTO outcome_records (category_id, amount, expense_date, description, vendor) VALUES

-- Rent (monthly)
  (2, 55000, '2025-10-01', 'Monthly rent - Jecna 10, Praha 2 - October',   'Sprava domu Praha s.r.o.'),
  (2, 55000, '2025-11-01', 'Monthly rent - Jecna 10, Praha 2 - November',  'Sprava domu Praha s.r.o.'),
  (2, 55000, '2025-12-01', 'Monthly rent - Jecna 10, Praha 2 - December',  'Sprava domu Praha s.r.o.'),
  (2, 55000, '2026-01-01', 'Monthly rent - Jecna 10, Praha 2 - January',   'Sprava domu Praha s.r.o.'),
  (2, 55000, '2026-02-01', 'Monthly rent - Jecna 10, Praha 2 - February',  'Sprava domu Praha s.r.o.'),
  (2, 55000, '2026-03-01', 'Monthly rent - Jecna 10, Praha 2 - March',     'Sprava domu Praha s.r.o.'),

-- Utilities - electricity & gas
  (3,  5200, '2025-10-05', 'Electricity and gas - October',   'E.ON Czech Republic'),
  (3,  4900, '2025-11-05', 'Electricity and gas - November',  'E.ON Czech Republic'),
  (3,  5600, '2025-12-05', 'Electricity and gas - December',  'E.ON Czech Republic'),
  (3,  4800, '2026-01-05', 'Electricity and gas - January',   'E.ON Czech Republic'),
  (3,  4200, '2026-02-05', 'Electricity and gas - February',  'E.ON Czech Republic'),
  (3,  3900, '2026-03-05', 'Electricity and gas - March',     'E.ON Czech Republic'),

-- Utilities - internet & phone
  (3,  1200, '2025-10-05', 'Internet and phone - October',    'O2 Czech Republic'),
  (3,  1200, '2025-11-05', 'Internet and phone - November',   'O2 Czech Republic'),
  (3,  1200, '2025-12-05', 'Internet and phone - December',   'O2 Czech Republic'),
  (3,  1200, '2026-01-05', 'Internet and phone - January',    'O2 Czech Republic'),
  (3,  1200, '2026-02-05', 'Internet and phone - February',   'O2 Czech Republic'),
  (3,  1200, '2026-03-05', 'Internet and phone - March',      'O2 Czech Republic'),

-- Dental materials
  (1, 19200, '2025-10-08', 'Composites, burs, gloves - monthly stock',      'DentalShop CZ s.r.o.'),
  (1, 17800, '2025-11-10', 'Composites, anaesthetics, impression materials', 'DentalShop CZ s.r.o.'),
  (1, 22500, '2025-12-05', 'Implant components + composites',                'Nobel Biocare CZ'),
  (1, 18500, '2026-01-08', 'Composites, burs, gloves - monthly stock',       'DentalShop CZ s.r.o.'),
  (1, 21000, '2026-02-10', 'Implant components + impression materials',      'Nobel Biocare CZ'),
  (1, 15800, '2026-03-07', 'Composites, anaesthetics, gloves',               'DentalShop CZ s.r.o.'),

-- Equipment
  (4, 45000, '2025-10-15', 'Ultrasonic scaler - Satelec P5 Newtron',  'Dental Equipment CZ'),
  (4,  8200, '2025-11-20', 'Sterilisation pouches + autoclave service','W&H Czech s.r.o.'),
  (4, 32000, '2025-12-10', 'Digital X-ray sensor - Carestream RVG 6200','KaVo Kerr CZ'),
  (4, 12000, '2026-02-20', 'Intraoral camera - replacement lens',      'KaVo Kerr CZ'),
  (4,  8500, '2026-03-12', 'Autoclave service and parts',              'W&H Czech s.r.o.'),

-- Other
  (5,  3200, '2025-10-20', 'Staff training - infection control',           'Czech Dental Chamber'),
  (5,  4800, '2025-11-14', 'Marketing - Google Ads + social media Q4',    'Digital Agency Praha'),
  (5,  2600, '2025-12-18', 'Office supplies and cleaning products',        'Office Depot CZ'),
  (5,  3500, '2026-01-20', 'Staff training - new equipment certification', 'Czech Dental Chamber'),
  (5,  5500, '2026-02-14', 'Marketing - Google Ads + social media Q1',    'Digital Agency Praha'),
  (5,  2800, '2026-03-18', 'Accounting services - Q1 2026',               'Accounting Praha s.r.o.');

-- ── 9. Salary Payments (Oct 2025 – Feb 2026) ────────────────
-- March not yet paid (month in progress)
INSERT INTO salary_payments (staff_id, amount, payment_date, note) VALUES
  -- October 2025
  (1, 92000, '2025-10-31', 'October salary - Dr. Porter'),
  (2, 76000, '2025-10-31', 'October salary - Dr. Mitchell'),
  (3, 38000, '2025-10-31', 'October salary - Carter'),
  (4, 35000, '2025-10-31', 'October salary - Brown'),
  (5, 46000, '2025-10-31', 'October salary - Wilson'),
  -- November 2025
  (1, 92000, '2025-11-30', 'November salary - Dr. Porter'),
  (2, 76000, '2025-11-30', 'November salary - Dr. Mitchell'),
  (3, 38000, '2025-11-30', 'November salary - Carter'),
  (4, 35000, '2025-11-30', 'November salary - Brown'),
  (5, 46000, '2025-11-30', 'November salary - Wilson'),
  -- December 2025
  (1, 92000, '2025-12-31', 'December salary - Dr. Porter'),
  (2, 76000, '2025-12-31', 'December salary - Dr. Mitchell'),
  (3, 38000, '2025-12-31', 'December salary - Carter'),
  (4, 35000, '2025-12-31', 'December salary - Brown'),
  (5, 46000, '2025-12-31', 'December salary - Wilson'),
  -- January 2026
  (1, 92000, '2026-01-31', 'January salary - Dr. Porter'),
  (2, 76000, '2026-01-31', 'January salary - Dr. Mitchell'),
  (3, 38000, '2026-01-31', 'January salary - Carter'),
  (4, 35000, '2026-01-31', 'January salary - Brown'),
  (5, 46000, '2026-01-31', 'January salary - Wilson'),
  -- February 2026
  (1, 92000, '2026-02-28', 'February salary - Dr. Porter'),
  (2, 76000, '2026-02-28', 'February salary - Dr. Mitchell'),
  (3, 38000, '2026-02-28', 'February salary - Carter'),
  (4, 35000, '2026-02-28', 'February salary - Brown'),
  (5, 46000, '2026-02-28', 'February salary - Wilson');

-- ── 10. Staff Timesheets (Oct 2025 – Mar 2026, Mon–Fri) ─────
INSERT INTO staff_timesheets (staff_id, work_date, start_time, end_time, hours) VALUES

-- Dr. Porter - October 2025
  (1,'2025-10-01','08:00','17:00',9), (1,'2025-10-02','08:00','17:00',9),
  (1,'2025-10-03','08:00','14:00',6),
  (1,'2025-10-06','08:00','17:00',9), (1,'2025-10-07','08:00','17:00',9),
  (1,'2025-10-08','08:00','17:00',9), (1,'2025-10-09','08:00','17:00',9),
  (1,'2025-10-10','08:00','14:00',6),
  (1,'2025-10-13','08:00','17:00',9), (1,'2025-10-14','08:00','17:00',9),
  (1,'2025-10-15','08:00','17:00',9), (1,'2025-10-16','08:00','17:00',9),
  (1,'2025-10-17','08:00','14:00',6),
  (1,'2025-10-20','08:00','17:00',9), (1,'2025-10-21','08:00','17:00',9),
  (1,'2025-10-22','08:00','17:00',9), (1,'2025-10-23','08:00','17:00',9),
  (1,'2025-10-24','08:00','14:00',6),
  (1,'2025-10-27','08:00','17:00',9), (1,'2025-10-28','08:00','17:00',9),
  (1,'2025-10-29','08:00','17:00',9), (1,'2025-10-30','08:00','17:00',9),
  (1,'2025-10-31','08:00','14:00',6),

-- Dr. Mitchell - October 2025
  (2,'2025-10-01','09:00','18:00',9), (2,'2025-10-02','09:00','18:00',9),
  (2,'2025-10-03','09:00','15:00',6),
  (2,'2025-10-06','09:00','18:00',9), (2,'2025-10-07','09:00','18:00',9),
  (2,'2025-10-08','09:00','18:00',9), (2,'2025-10-09','09:00','18:00',9),
  (2,'2025-10-10','09:00','15:00',6),
  (2,'2025-10-13','09:00','18:00',9), (2,'2025-10-14','09:00','18:00',9),
  (2,'2025-10-15','09:00','18:00',9), (2,'2025-10-16','09:00','18:00',9),
  (2,'2025-10-17','09:00','15:00',6),
  (2,'2025-10-20','09:00','18:00',9), (2,'2025-10-21','09:00','18:00',9),
  (2,'2025-10-22','09:00','18:00',9), (2,'2025-10-23','09:00','18:00',9),
  (2,'2025-10-24','09:00','15:00',6),
  (2,'2025-10-27','09:00','18:00',9), (2,'2025-10-28','09:00','18:00',9),
  (2,'2025-10-29','09:00','18:00',9), (2,'2025-10-30','09:00','18:00',9),
  (2,'2025-10-31','09:00','15:00',6),

-- Dr. Porter - November 2025
  (1,'2025-11-03','08:00','17:00',9), (1,'2025-11-04','08:00','17:00',9),
  (1,'2025-11-05','08:00','17:00',9), (1,'2025-11-06','08:00','17:00',9),
  (1,'2025-11-07','08:00','14:00',6),
  (1,'2025-11-10','08:00','17:00',9), (1,'2025-11-11','08:00','17:00',9),
  (1,'2025-11-12','08:00','17:00',9), (1,'2025-11-13','08:00','17:00',9),
  (1,'2025-11-14','08:00','14:00',6),
  (1,'2025-11-17','08:00','17:00',9), (1,'2025-11-18','08:00','17:00',9),
  (1,'2025-11-19','08:00','17:00',9), (1,'2025-11-20','08:00','17:00',9),
  (1,'2025-11-21','08:00','14:00',6),
  (1,'2025-11-24','08:00','17:00',9), (1,'2025-11-25','08:00','17:00',9),
  (1,'2025-11-26','08:00','17:00',9), (1,'2025-11-27','08:00','17:00',9),
  (1,'2025-11-28','08:00','14:00',6),

-- Dr. Mitchell - November 2025
  (2,'2025-11-03','09:00','18:00',9), (2,'2025-11-04','09:00','18:00',9),
  (2,'2025-11-05','09:00','18:00',9), (2,'2025-11-06','09:00','18:00',9),
  (2,'2025-11-07','09:00','15:00',6),
  (2,'2025-11-10','09:00','18:00',9), (2,'2025-11-11','09:00','18:00',9),
  (2,'2025-11-12','09:00','18:00',9), (2,'2025-11-13','09:00','18:00',9),
  (2,'2025-11-14','09:00','15:00',6),
  (2,'2025-11-17','09:00','18:00',9), (2,'2025-11-18','09:00','18:00',9),
  (2,'2025-11-19','09:00','18:00',9), (2,'2025-11-20','09:00','18:00',9),
  (2,'2025-11-21','09:00','15:00',6),
  (2,'2025-11-24','09:00','18:00',9), (2,'2025-11-25','09:00','18:00',9),
  (2,'2025-11-26','09:00','18:00',9), (2,'2025-11-27','09:00','18:00',9),
  (2,'2025-11-28','09:00','15:00',6),

-- Dr. Porter - December 2025
  (1,'2025-12-01','08:00','17:00',9), (1,'2025-12-02','08:00','17:00',9),
  (1,'2025-12-03','08:00','17:00',9), (1,'2025-12-04','08:00','17:00',9),
  (1,'2025-12-05','08:00','14:00',6),
  (1,'2025-12-08','08:00','17:00',9), (1,'2025-12-09','08:00','17:00',9),
  (1,'2025-12-10','08:00','17:00',9), (1,'2025-12-11','08:00','17:00',9),
  (1,'2025-12-12','08:00','14:00',6),
  (1,'2025-12-15','08:00','17:00',9), (1,'2025-12-16','08:00','17:00',9),
  (1,'2025-12-17','08:00','17:00',9), (1,'2025-12-18','08:00','17:00',9),
  (1,'2025-12-19','08:00','14:00',6),

-- Dr. Mitchell - December 2025
  (2,'2025-12-01','09:00','18:00',9), (2,'2025-12-02','09:00','18:00',9),
  (2,'2025-12-03','09:00','18:00',9), (2,'2025-12-04','09:00','18:00',9),
  (2,'2025-12-05','09:00','15:00',6),
  (2,'2025-12-08','09:00','18:00',9), (2,'2025-12-09','09:00','18:00',9),
  (2,'2025-12-10','09:00','18:00',9), (2,'2025-12-11','09:00','18:00',9),
  (2,'2025-12-12','09:00','15:00',6),
  (2,'2025-12-15','09:00','18:00',9), (2,'2025-12-16','09:00','18:00',9),
  (2,'2025-12-17','09:00','18:00',9), (2,'2025-12-18','09:00','18:00',9),
  (2,'2025-12-19','09:00','15:00',6),

-- Doctors - January & February 2026 (condensed)
  (1,'2026-01-05','08:00','17:00',9), (1,'2026-01-06','08:00','17:00',9),
  (1,'2026-01-07','08:00','17:00',9), (1,'2026-01-08','08:00','17:00',9),
  (1,'2026-01-09','08:00','14:00',6),
  (1,'2026-01-12','08:00','17:00',9), (1,'2026-01-13','08:00','17:00',9),
  (1,'2026-01-14','08:00','17:00',9), (1,'2026-01-15','08:00','17:00',9),
  (1,'2026-01-16','08:00','14:00',6),
  (1,'2026-01-19','08:00','17:00',9), (1,'2026-01-20','08:00','17:00',9),
  (1,'2026-01-21','08:00','17:00',9), (1,'2026-01-22','08:00','17:00',9),
  (1,'2026-01-23','08:00','14:00',6),
  (1,'2026-01-26','08:00','17:00',9), (1,'2026-01-27','08:00','17:00',9),
  (1,'2026-01-28','08:00','17:00',9), (1,'2026-01-29','08:00','17:00',9),
  (1,'2026-01-30','08:00','14:00',6),
  (2,'2026-01-05','09:00','18:00',9), (2,'2026-01-06','09:00','18:00',9),
  (2,'2026-01-07','09:00','18:00',9), (2,'2026-01-08','09:00','18:00',9),
  (2,'2026-01-09','09:00','15:00',6),
  (2,'2026-01-12','09:00','18:00',9), (2,'2026-01-13','09:00','18:00',9),
  (2,'2026-01-14','09:00','18:00',9), (2,'2026-01-15','09:00','18:00',9),
  (2,'2026-01-16','09:00','15:00',6),
  (2,'2026-01-19','09:00','18:00',9), (2,'2026-01-20','09:00','18:00',9),
  (2,'2026-01-21','09:00','18:00',9), (2,'2026-01-22','09:00','18:00',9),
  (2,'2026-01-23','09:00','15:00',6),
  (2,'2026-01-26','09:00','18:00',9), (2,'2026-01-27','09:00','18:00',9),
  (2,'2026-01-28','09:00','18:00',9), (2,'2026-01-29','09:00','18:00',9),
  (2,'2026-01-30','09:00','15:00',6),

-- February 2026
  (1,'2026-02-02','08:00','17:00',9), (1,'2026-02-03','08:00','17:00',9),
  (1,'2026-02-04','08:00','17:00',9), (1,'2026-02-05','08:00','17:00',9),
  (1,'2026-02-06','08:00','14:00',6),
  (1,'2026-02-09','08:00','17:00',9), (1,'2026-02-10','08:00','17:00',9),
  (1,'2026-02-11','08:00','17:00',9), (1,'2026-02-12','08:00','17:00',9),
  (1,'2026-02-13','08:00','14:00',6),
  (1,'2026-02-16','08:00','17:00',9), (1,'2026-02-17','08:00','17:00',9),
  (1,'2026-02-18','08:00','17:00',9), (1,'2026-02-19','08:00','17:00',9),
  (1,'2026-02-20','08:00','14:00',6),
  (1,'2026-02-23','08:00','17:00',9), (1,'2026-02-24','08:00','17:00',9),
  (1,'2026-02-25','08:00','17:00',9), (1,'2026-02-26','08:00','17:00',9),
  (1,'2026-02-27','08:00','14:00',6),
  (2,'2026-02-02','09:00','18:00',9), (2,'2026-02-03','09:00','18:00',9),
  (2,'2026-02-04','09:00','18:00',9), (2,'2026-02-05','09:00','18:00',9),
  (2,'2026-02-06','09:00','15:00',6),
  (2,'2026-02-09','09:00','18:00',9), (2,'2026-02-10','09:00','18:00',9),
  (2,'2026-02-11','09:00','18:00',9), (2,'2026-02-12','09:00','18:00',9),
  (2,'2026-02-13','09:00','15:00',6),
  (2,'2026-02-16','09:00','18:00',9), (2,'2026-02-17','09:00','18:00',9),
  (2,'2026-02-18','09:00','18:00',9), (2,'2026-02-19','09:00','18:00',9),
  (2,'2026-02-20','09:00','15:00',6),
  (2,'2026-02-23','09:00','18:00',9), (2,'2026-02-24','09:00','18:00',9),
  (2,'2026-02-25','09:00','18:00',9), (2,'2026-02-26','09:00','18:00',9),
  (2,'2026-02-27','09:00','15:00',6),

-- March 2026 (to current date)
  (1,'2026-03-02','08:00','17:00',9), (1,'2026-03-03','08:00','17:00',9),
  (1,'2026-03-04','08:00','17:00',9), (1,'2026-03-05','08:00','17:00',9),
  (1,'2026-03-06','08:00','14:00',6),
  (1,'2026-03-10','08:00','17:00',9), (1,'2026-03-11','08:00','17:00',9),
  (1,'2026-03-12','08:00','17:00',9), (1,'2026-03-13','08:00','17:00',9),
  (1,'2026-03-14','08:00','14:00',6),
  (1,'2026-03-17','08:00','17:00',9), (1,'2026-03-18','08:00','17:00',9),
  (1,'2026-03-19','08:00','17:00',9), (1,'2026-03-20','08:00','17:00',9),
  (1,'2026-03-21','08:00','13:00',5),
  (2,'2026-03-02','09:00','18:00',9), (2,'2026-03-03','09:00','18:00',9),
  (2,'2026-03-04','09:00','18:00',9), (2,'2026-03-05','09:00','18:00',9),
  (2,'2026-03-06','09:00','15:00',6),
  (2,'2026-03-10','09:00','18:00',9), (2,'2026-03-11','09:00','18:00',9),
  (2,'2026-03-12','09:00','18:00',9), (2,'2026-03-13','09:00','18:00',9),
  (2,'2026-03-14','09:00','15:00',6),
  (2,'2026-03-17','09:00','18:00',9), (2,'2026-03-18','09:00','18:00',9),
  (2,'2026-03-19','09:00','18:00',9), (2,'2026-03-20','09:00','18:00',9),
  (2,'2026-03-21','09:00','15:00',6),

-- Assistants - March 2026
  (3,'2026-03-10','08:00','17:00',9), (3,'2026-03-11','08:00','17:00',9),
  (3,'2026-03-12','08:00','17:00',9), (3,'2026-03-13','08:00','17:00',9),
  (3,'2026-03-17','08:00','17:00',9), (3,'2026-03-18','08:00','17:00',9),
  (3,'2026-03-19','08:00','17:00',9), (3,'2026-03-20','08:00','17:00',9),
  (4,'2026-03-10','08:30','17:30',9), (4,'2026-03-11','08:30','17:30',9),
  (4,'2026-03-12','08:30','17:30',9), (4,'2026-03-13','08:30','17:30',9),
  (4,'2026-03-17','08:30','17:30',9), (4,'2026-03-18','08:30','17:30',9),
  (4,'2026-03-19','08:30','17:30',9), (4,'2026-03-20','08:30','17:30',9);

-- ── 11. Shifts / Schedule (Mar 17 – Mar 28) ─────────────────
INSERT INTO shifts (staff_id, start_time, end_time, note, status) VALUES
-- Dr. Porter
  (1,'2026-03-17 08:00+01','2026-03-17 17:00+01', NULL, 'accepted'),
  (1,'2026-03-18 08:00+01','2026-03-18 17:00+01', NULL, 'accepted'),
  (1,'2026-03-19 08:00+01','2026-03-19 17:00+01', NULL, 'accepted'),
  (1,'2026-03-20 08:00+01','2026-03-20 17:00+01', NULL, 'accepted'),
  (1,'2026-03-21 08:00+01','2026-03-21 13:00+01', NULL, 'accepted'),
  (1,'2026-03-24 08:00+01','2026-03-24 17:00+01', NULL, 'pending'),
  (1,'2026-03-25 08:00+01','2026-03-25 17:00+01', NULL, 'pending'),
  (1,'2026-03-26 08:00+01','2026-03-26 17:00+01', NULL, 'pending'),
  (1,'2026-03-27 08:00+01','2026-03-27 17:00+01', NULL, 'pending'),
  (1,'2026-03-28 08:00+01','2026-03-28 13:00+01', NULL, 'pending'),
-- Dr. Mitchell
  (2,'2026-03-17 09:00+01','2026-03-17 18:00+01', NULL, 'accepted'),
  (2,'2026-03-18 09:00+01','2026-03-18 18:00+01', NULL, 'accepted'),
  (2,'2026-03-19 09:00+01','2026-03-19 18:00+01', NULL, 'accepted'),
  (2,'2026-03-20 09:00+01','2026-03-20 18:00+01', NULL, 'accepted'),
  (2,'2026-03-21 09:00+01','2026-03-21 15:00+01', NULL, 'accepted'),
  (2,'2026-03-24 09:00+01','2026-03-24 18:00+01', NULL, 'pending'),
  (2,'2026-03-25 09:00+01','2026-03-25 18:00+01', NULL, 'pending'),
  (2,'2026-03-26 09:00+01','2026-03-26 18:00+01', NULL, 'pending'),
  (2,'2026-03-27 09:00+01','2026-03-27 18:00+01', NULL, 'pending'),
  (2,'2026-03-28 09:00+01','2026-03-28 15:00+01', NULL, 'pending'),
-- Assistants
  (3,'2026-03-17 08:00+01','2026-03-17 17:00+01', NULL, 'accepted'),
  (3,'2026-03-18 08:00+01','2026-03-18 17:00+01', NULL, 'accepted'),
  (3,'2026-03-19 08:00+01','2026-03-19 17:00+01', NULL, 'accepted'),
  (3,'2026-03-20 08:00+01','2026-03-20 17:00+01', NULL, 'accepted'),
  (3,'2026-03-24 08:00+01','2026-03-24 17:00+01', NULL, 'pending'),
  (3,'2026-03-25 08:00+01','2026-03-25 17:00+01', NULL, 'pending'),
  (4,'2026-03-17 08:30+01','2026-03-17 17:30+01', NULL, 'accepted'),
  (4,'2026-03-18 08:30+01','2026-03-18 17:30+01', NULL, 'accepted'),
  (4,'2026-03-19 08:30+01','2026-03-19 17:30+01', NULL, 'accepted'),
  (4,'2026-03-20 08:30+01','2026-03-20 17:30+01', NULL, 'accepted'),
  (4,'2026-03-24 08:30+01','2026-03-24 17:30+01', NULL, 'pending'),
  (4,'2026-03-25 08:30+01','2026-03-25 17:30+01', NULL, 'pending');

-- ── 12. Reset sequences so new rows get correct auto-IDs ─────
SELECT setval('staff_roles_id_seq',        (SELECT MAX(id) FROM staff_roles));
SELECT setval('staff_id_seq',              (SELECT MAX(id) FROM staff));
SELECT setval('patients_id_seq',           (SELECT MAX(id) FROM patients));
SELECT setval('income_records_id_seq',     (SELECT MAX(id) FROM income_records));
SELECT setval('outcome_records_id_seq',    (SELECT MAX(id) FROM outcome_records));
SELECT setval('outcome_categories_id_seq', (SELECT MAX(id) FROM outcome_categories));
SELECT setval('salary_payments_id_seq',    (SELECT MAX(id) FROM salary_payments));
SELECT setval('staff_timesheets_id_seq',   (SELECT MAX(id) FROM staff_timesheets));
SELECT setval('shifts_id_seq',             (SELECT MAX(id) FROM shifts));
SELECT setval('clinic_settings_id_seq',    (SELECT MAX(id) FROM clinic_settings));

COMMIT;

-- ============================================================
--  AFTER LOADING -- set staff passwords via psql:
--
--  The app uses bcrypt. Generate a hash with Python:
--    python3 -c "import bcrypt; print(bcrypt.hashpw(b'Demo1234', bcrypt.gensalt(12)).decode())"
--
--  Then set all staff to the same demo password at once:
--    UPDATE staff SET password_hash = '<paste hash here>';
--
--  Or set individual passwords:
--    UPDATE staff SET password_hash = '<hash>' WHERE id = 1;  -- Dr. Porter
--    UPDATE staff SET password_hash = '<hash>' WHERE id = 2;  -- Dr. Mitchell
--    UPDATE staff SET password_hash = '<hash>' WHERE id = 3;  -- Carter
--    UPDATE staff SET password_hash = '<hash>' WHERE id = 4;  -- Brown
--    UPDATE staff SET password_hash = '<hash>' WHERE id = 5;  -- Wilson
-- ============================================================
