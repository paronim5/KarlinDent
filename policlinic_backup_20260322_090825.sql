--
-- PostgreSQL database dump
--

\restrict WGWVnDuLiAhBH7kPL1xHqM5RQ1k8cFLBzbGXCo5Pdp4wYvjrNtcxTC3Y4XsaPBt

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: update_doctor_total_revenue(); Type: FUNCTION; Schema: public; Owner: policlinic
--

CREATE FUNCTION public.update_doctor_total_revenue() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE staff
    SET total_revenue = total_revenue + NEW.amount,
        updated_at    = NOW()
    WHERE id = NEW.doctor_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_doctor_total_revenue() OWNER TO policlinic;

--
-- Name: update_last_paid_at(); Type: FUNCTION; Schema: public; Owner: policlinic
--

CREATE FUNCTION public.update_last_paid_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE staff
    SET last_paid_at = NEW.payment_date,
        updated_at   = NOW()
    WHERE id = NEW.staff_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_last_paid_at() OWNER TO policlinic;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: income_records; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.income_records (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    doctor_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    lab_cost numeric(12,2) DEFAULT 0 NOT NULL,
    payment_method character varying(10) NOT NULL,
    service_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    service_time time without time zone DEFAULT CURRENT_TIME,
    salary_payment_id integer,
    CONSTRAINT income_records_payment_method_check CHECK (((payment_method)::text = ANY (ARRAY[('cash'::character varying)::text, ('card'::character varying)::text])))
);


ALTER TABLE public.income_records OWNER TO policlinic;

--
-- Name: avg_patient_payment; Type: VIEW; Schema: public; Owner: policlinic
--

CREATE VIEW public.avg_patient_payment AS
 SELECT round(avg(amount), 2) AS avg_payment
   FROM public.income_records;


ALTER VIEW public.avg_patient_payment OWNER TO policlinic;

--
-- Name: staff; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.staff (
    id integer NOT NULL,
    role_id integer NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    phone character varying(30),
    email character varying(150),
    bio text,
    base_salary numeric(12,2) DEFAULT 0 NOT NULL,
    commission_rate numeric(5,4) DEFAULT 0 NOT NULL,
    last_paid_at date,
    total_revenue numeric(14,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash character varying(255)
);


ALTER TABLE public.staff OWNER TO policlinic;

--
-- Name: staff_roles; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.staff_roles (
    id integer NOT NULL,
    name character varying(50) NOT NULL
);


ALTER TABLE public.staff_roles OWNER TO policlinic;

--
-- Name: avg_salary_by_role; Type: VIEW; Schema: public; Owner: policlinic
--

CREATE VIEW public.avg_salary_by_role AS
 SELECT r.name AS role,
    round(avg(s.base_salary), 2) AS avg_salary
   FROM (public.staff s
     JOIN public.staff_roles r ON ((r.id = s.role_id)))
  WHERE (s.is_active = true)
  GROUP BY r.name;


ALTER VIEW public.avg_salary_by_role OWNER TO policlinic;

--
-- Name: clinic_settings; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.clinic_settings (
    id integer NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value numeric(14,2),
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.clinic_settings OWNER TO policlinic;

--
-- Name: clinic_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.clinic_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clinic_settings_id_seq OWNER TO policlinic;

--
-- Name: clinic_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.clinic_settings_id_seq OWNED BY public.clinic_settings.id;


--
-- Name: outcome_records; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.outcome_records (
    id integer NOT NULL,
    category_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vendor character varying(255),
    expense_time time without time zone DEFAULT CURRENT_TIME
);


ALTER TABLE public.outcome_records OWNER TO policlinic;

--
-- Name: salary_payments; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.salary_payments (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.salary_payments OWNER TO policlinic;

--
-- Name: daily_pnl; Type: VIEW; Schema: public; Owner: policlinic
--

CREATE VIEW public.daily_pnl AS
 SELECT (d.d)::date AS day,
    COALESCE(inc.total_income, (0)::numeric) AS total_income,
    (COALESCE("out".total_outcome, (0)::numeric) + COALESCE(sal.total_salaries, (0)::numeric)) AS total_outcome,
    ((COALESCE(inc.total_income, (0)::numeric) - COALESCE("out".total_outcome, (0)::numeric)) - COALESCE(sal.total_salaries, (0)::numeric)) AS pnl
   FROM (((generate_series((( SELECT min(LEAST(sub.service_date, sub.expense_date)) AS min
           FROM ( SELECT min(income_records.service_date) AS service_date,
                    NULL::date AS expense_date
                   FROM public.income_records
                UNION ALL
                 SELECT NULL::date AS date,
                    min(outcome_records.expense_date) AS min
                   FROM public.outcome_records) sub))::timestamp with time zone, (CURRENT_DATE)::timestamp with time zone, '1 day'::interval) d(d)
     LEFT JOIN ( SELECT income_records.service_date AS day,
            sum(income_records.amount) AS total_income
           FROM public.income_records
          GROUP BY income_records.service_date) inc ON ((inc.day = (d.d)::date)))
     LEFT JOIN ( SELECT outcome_records.expense_date AS day,
            sum(outcome_records.amount) AS total_outcome
           FROM public.outcome_records
          GROUP BY outcome_records.expense_date) "out" ON (("out".day = (d.d)::date)))
     LEFT JOIN ( SELECT salary_payments.payment_date AS day,
            sum(salary_payments.amount) AS total_salaries
           FROM public.salary_payments
          GROUP BY salary_payments.payment_date) sal ON ((sal.day = (d.d)::date)));


ALTER VIEW public.daily_pnl OWNER TO policlinic;

--
-- Name: income_records_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.income_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.income_records_id_seq OWNER TO policlinic;

--
-- Name: income_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.income_records_id_seq OWNED BY public.income_records.id;


--
-- Name: medicine_presets; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.medicine_presets (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.medicine_presets OWNER TO policlinic;

--
-- Name: medicine_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.medicine_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.medicine_presets_id_seq OWNER TO policlinic;

--
-- Name: medicine_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.medicine_presets_id_seq OWNED BY public.medicine_presets.id;


--
-- Name: outcome_categories; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.outcome_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL
);


ALTER TABLE public.outcome_categories OWNER TO policlinic;

--
-- Name: outcome_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.outcome_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.outcome_categories_id_seq OWNER TO policlinic;

--
-- Name: outcome_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.outcome_categories_id_seq OWNED BY public.outcome_categories.id;


--
-- Name: outcome_records_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.outcome_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.outcome_records_id_seq OWNER TO policlinic;

--
-- Name: outcome_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.outcome_records_id_seq OWNED BY public.outcome_records.id;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.patients (
    id integer NOT NULL,
    first_name character varying(100),
    last_name character varying(100) NOT NULL,
    phone character varying(30),
    street_address character varying(255),
    city character varying(50),
    zip_code character varying(10),
    email character varying(150),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.patients OWNER TO policlinic;

--
-- Name: patients_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.patients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patients_id_seq OWNER TO policlinic;

--
-- Name: patients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.patients_id_seq OWNED BY public.patients.id;


--
-- Name: salary_adjustments; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.salary_adjustments (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text,
    applied_to_salary_payment_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.salary_adjustments OWNER TO policlinic;

--
-- Name: salary_adjustments_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.salary_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.salary_adjustments_id_seq OWNER TO policlinic;

--
-- Name: salary_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.salary_adjustments_id_seq OWNED BY public.salary_adjustments.id;


--
-- Name: salary_amount_audit; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.salary_amount_audit (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    salary_payment_id integer,
    previous_amount numeric(12,2) NOT NULL,
    new_amount numeric(12,2) NOT NULL,
    delta_amount numeric(12,2) NOT NULL,
    change_source character varying(40) NOT NULL,
    change_reason text,
    changed_by_staff_id integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.salary_amount_audit OWNER TO policlinic;

--
-- Name: salary_amount_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.salary_amount_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.salary_amount_audit_id_seq OWNER TO policlinic;

--
-- Name: salary_amount_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.salary_amount_audit_id_seq OWNED BY public.salary_amount_audit.id;


--
-- Name: salary_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.salary_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.salary_payments_id_seq OWNER TO policlinic;

--
-- Name: salary_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.salary_payments_id_seq OWNED BY public.salary_payments.id;


--
-- Name: schedule_audit_logs; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.schedule_audit_logs (
    id integer NOT NULL,
    shift_id integer,
    action character varying(20) NOT NULL,
    changed_by integer,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schedule_audit_logs OWNER TO policlinic;

--
-- Name: schedule_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.schedule_audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.schedule_audit_logs_id_seq OWNER TO policlinic;

--
-- Name: schedule_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.schedule_audit_logs_id_seq OWNED BY public.schedule_audit_logs.id;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.shifts (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.shifts OWNER TO policlinic;

--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.shifts_id_seq OWNER TO policlinic;

--
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- Name: staff_documents; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.staff_documents (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    document_type character varying(60) NOT NULL,
    period_from date,
    period_to date,
    signed_at timestamp with time zone,
    signer_name character varying(150) NOT NULL,
    signature_hash character varying(64) NOT NULL,
    signature_token character varying(64),
    file_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff_documents OWNER TO policlinic;

--
-- Name: staff_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.staff_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_documents_id_seq OWNER TO policlinic;

--
-- Name: staff_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.staff_documents_id_seq OWNED BY public.staff_documents.id;


--
-- Name: staff_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_id_seq OWNER TO policlinic;

--
-- Name: staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.staff_id_seq OWNED BY public.staff.id;


--
-- Name: staff_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.staff_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_roles_id_seq OWNER TO policlinic;

--
-- Name: staff_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.staff_roles_id_seq OWNED BY public.staff_roles.id;


--
-- Name: staff_timesheets; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.staff_timesheets (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    work_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    hours numeric(6,2) DEFAULT 0 NOT NULL,
    note text
);


ALTER TABLE public.staff_timesheets OWNER TO policlinic;

--
-- Name: staff_timesheets_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.staff_timesheets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_timesheets_id_seq OWNER TO policlinic;

--
-- Name: staff_timesheets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.staff_timesheets_id_seq OWNED BY public.staff_timesheets.id;


--
-- Name: timesheets_audit; Type: TABLE; Schema: public; Owner: policlinic
--

CREATE TABLE public.timesheets_audit (
    id integer NOT NULL,
    timesheet_id integer,
    staff_id integer NOT NULL,
    action character varying(20) NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.timesheets_audit OWNER TO policlinic;

--
-- Name: timesheets_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: policlinic
--

CREATE SEQUENCE public.timesheets_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.timesheets_audit_id_seq OWNER TO policlinic;

--
-- Name: timesheets_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: policlinic
--

ALTER SEQUENCE public.timesheets_audit_id_seq OWNED BY public.timesheets_audit.id;


--
-- Name: clinic_settings id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.clinic_settings ALTER COLUMN id SET DEFAULT nextval('public.clinic_settings_id_seq'::regclass);


--
-- Name: income_records id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records ALTER COLUMN id SET DEFAULT nextval('public.income_records_id_seq'::regclass);


--
-- Name: medicine_presets id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.medicine_presets ALTER COLUMN id SET DEFAULT nextval('public.medicine_presets_id_seq'::regclass);


--
-- Name: outcome_categories id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_categories ALTER COLUMN id SET DEFAULT nextval('public.outcome_categories_id_seq'::regclass);


--
-- Name: outcome_records id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_records ALTER COLUMN id SET DEFAULT nextval('public.outcome_records_id_seq'::regclass);


--
-- Name: patients id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.patients ALTER COLUMN id SET DEFAULT nextval('public.patients_id_seq'::regclass);


--
-- Name: salary_adjustments id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_adjustments ALTER COLUMN id SET DEFAULT nextval('public.salary_adjustments_id_seq'::regclass);


--
-- Name: salary_amount_audit id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_amount_audit ALTER COLUMN id SET DEFAULT nextval('public.salary_amount_audit_id_seq'::regclass);


--
-- Name: salary_payments id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_payments ALTER COLUMN id SET DEFAULT nextval('public.salary_payments_id_seq'::regclass);


--
-- Name: schedule_audit_logs id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.schedule_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.schedule_audit_logs_id_seq'::regclass);


--
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- Name: staff id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff ALTER COLUMN id SET DEFAULT nextval('public.staff_id_seq'::regclass);


--
-- Name: staff_documents id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_documents ALTER COLUMN id SET DEFAULT nextval('public.staff_documents_id_seq'::regclass);


--
-- Name: staff_roles id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_roles ALTER COLUMN id SET DEFAULT nextval('public.staff_roles_id_seq'::regclass);


--
-- Name: staff_timesheets id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_timesheets ALTER COLUMN id SET DEFAULT nextval('public.staff_timesheets_id_seq'::regclass);


--
-- Name: timesheets_audit id; Type: DEFAULT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.timesheets_audit ALTER COLUMN id SET DEFAULT nextval('public.timesheets_audit_id_seq'::regclass);


--
-- Data for Name: clinic_settings; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.clinic_settings (id, setting_key, setting_value, description, updated_at) FROM stdin;
1	monthly_lease_cost	\N	Monthly rent/lease cost for clinic premises	2026-03-08 13:00:00.079999+00
2	avg_doctor_salary	\N	Average monthly salary for doctors	2026-03-08 13:00:00.079999+00
3	avg_assistant_salary	\N	Average monthly salary for assistants	2026-03-08 13:00:00.079999+00
4	avg_administrator_salary	\N	Average monthly salary for administrators	2026-03-08 13:00:00.079999+00
5	avg_janitor_salary	\N	Average monthly salary for janitors	2026-03-08 13:00:00.079999+00
\.


--
-- Data for Name: income_records; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.income_records (id, patient_id, doctor_id, amount, lab_cost, payment_method, service_date, note, created_at, service_time, salary_payment_id) FROM stdin;
110	56	8	13000.00	0.00	card	2026-03-16	\N	2026-03-16 11:34:07.581449+00	11:34:07.581449	\N
3	4	2	2500.00	0.00	card	2026-03-08	\N	2026-03-08 15:13:28.112376+00	15:13:28.112376	1
112	99	1	2000.00	0.00	card	2026-03-16	\N	2026-03-16 13:00:43.667036+00	13:00:43.667036	\N
114	5	1	2500.00	0.00	card	2026-03-16	\N	2026-03-16 15:07:27.108602+00	15:07:27.108602	\N
116	101	2	3000.00	2000.00	cash	2026-03-16	lab_note=CBCT	2026-03-16 15:58:43.051129+00	15:58:43.051129	20
118	102	1	7000.00	0.00	card	2026-03-16	\N	2026-03-16 18:02:32.088986+00	18:02:32.088986	\N
120	68	1	3500.00	0.00	card	2026-03-17	\N	2026-03-17 10:17:47.32356+00	10:17:47.32356	\N
122	16	1	3000.00	0.00	card	2026-03-17	\N	2026-03-17 13:01:44.386537+00	13:01:44.386537	\N
126	106	1	7000.00	0.00	cash	2026-03-17	\N	2026-03-17 15:02:43.755522+00	15:02:43.755522	\N
124	105	4	2000.00	0.00	cash	2026-03-17	\N	2026-03-17 14:02:45.413496+00	14:02:45.413496	22
32	31	4	3000.00	0.00	card	2026-03-11	\N	2026-03-11 14:32:51.910416+00	14:32:51.910416	22
34	33	4	5000.00	0.00	cash	2026-03-11	\N	2026-03-11 15:42:17.140142+00	15:42:17.140142	22
36	35	4	2500.00	0.00	card	2026-03-11	\N	2026-03-11 16:29:40.795165+00	16:29:40.795165	22
37	36	4	3000.00	0.00	card	2026-03-11	\N	2026-03-11 16:52:07.502546+00	16:52:07.502546	22
38	14	4	7500.00	0.00	card	2026-03-11	\N	2026-03-11 18:29:04.220737+00	18:29:04.220737	22
70	66	4	1700.00	0.00	card	2026-03-14	\N	2026-03-14 10:55:50.079833+00	10:55:50.079833	22
71	67	4	2500.00	0.00	cash	2026-03-14	\N	2026-03-14 11:36:00.192169+00	11:36:00.192169	22
72	8	4	2500.00	2500.00	cash	2026-03-14	lab_note=cbct	2026-03-14 11:54:07.317485+00	11:54:07.317485	22
73	10	4	2500.00	2500.00	cash	2026-03-14	cbct | lab_note=cbct	2026-03-14 13:45:30.953162+00	13:45:30.953162	22
77	23	4	2500.00	0.00	cash	2026-03-14	\N	2026-03-14 16:36:46.219621+00	16:36:46.219621	22
80	72	4	4500.00	0.00	cash	2026-03-14	\N	2026-03-14 18:47:21.503137+00	18:47:21.503137	22
81	73	4	2000.00	0.00	cash	2026-03-14	\N	2026-03-14 18:49:44.818591+00	18:49:44.818591	22
128	107	1	3000.00	0.00	card	2026-03-17	+ Denis	2026-03-17 16:44:45.094104+00	16:44:45.094104	\N
130	108	1	700.00	0.00	card	2026-03-18	\N	2026-03-18 11:18:21.300804+00	11:18:21.300804	\N
40	38	3	2000.00	0.00	card	2026-03-12	\N	2026-03-12 10:18:02.991721+00	10:18:02.991721	3
42	40	3	9000.00	0.00	cash	2026-03-12	\N	2026-03-12 11:38:48.877406+00	11:38:48.877406	3
43	41	3	20000.00	0.00	card	2026-03-12	\N	2026-03-12 13:14:14.20315+00	13:14:14.20315	3
47	45	3	3500.00	0.00	card	2026-03-12	\N	2026-03-12 14:19:47.041585+00	14:19:47.041585	3
27	28	8	3900.00	0.00	card	2026-03-11	\N	2026-03-11 09:15:37.070987+00	09:15:37.070987	4
29	24	8	3900.00	0.00	card	2026-03-11	\N	2026-03-11 10:42:59.617877+00	10:42:59.617877	4
39	37	8	4200.00	0.00	cash	2026-03-12	\N	2026-03-12 09:57:32.669525+00	09:57:32.669525	4
41	39	8	3500.00	0.00	card	2026-03-12	\N	2026-03-12 10:56:56.406322+00	10:56:56.406322	4
44	42	8	7200.00	0.00	card	2026-03-12	\N	2026-03-12 13:42:14.319029+00	13:42:14.319029	4
19	20	7	3000.00	0.00	cash	2026-03-10	\N	2026-03-10 15:59:11.774802+00	15:59:11.774802	5
20	21	7	8500.00	0.00	card	2026-03-10	\N	2026-03-10 16:02:34.476467+00	16:02:34.476467	5
23	24	7	4000.00	0.00	card	2026-03-10	\N	2026-03-10 17:10:56.841327+00	17:10:56.841327	5
30	24	7	1500.00	0.00	card	2026-03-11	\N	2026-03-11 10:43:11.386816+00	10:43:11.386816	5
33	32	7	6000.00	0.00	cash	2026-03-11	\N	2026-03-11 15:04:33.672786+00	15:04:33.672786	5
45	43	7	2200.00	0.00	card	2026-03-12	\N	2026-03-12 13:44:22.842197+00	13:44:22.842197	5
49	47	7	3500.00	0.00	card	2026-03-12	dh + vektor	2026-03-12 16:04:43.45169+00	16:04:43.45169	5
50	48	7	6500.00	0.00	card	2026-03-12	\N	2026-03-12 18:02:35.51661+00	18:02:35.51661	5
132	110	1	700.00	0.00	card	2026-03-18	\N	2026-03-18 12:02:34.434853+00	12:02:34.434853	\N
134	112	1	4500.00	0.00	card	2026-03-18	\N	2026-03-18 14:17:53.353063+00	14:17:53.353063	\N
136	114	1	2200.00	0.00	cash	2026-03-18	\N	2026-03-18 15:36:37.993035+00	15:36:37.993035	\N
138	116	1	1200.00	0.00	card	2026-03-18	\N	2026-03-18 16:45:13.088119+00	16:45:13.088119	\N
140	118	3	2000.00	0.00	card	2026-03-19	\N	2026-03-19 09:51:11.442586+00	09:51:11.442586	\N
142	28	8	5000.00	2540.00	card	2026-03-19	lab_note=MK korunka	2026-03-19 10:30:01.944681+00	10:30:01.944681	\N
144	40	3	1000.00	0.00	cash	2026-03-19	\N	2026-03-19 11:18:45.307586+00	11:18:45.307586	\N
146	122	3	1000.00	0.00	card	2026-03-19	\N	2026-03-19 12:22:13.62636+00	12:22:13.62636	\N
148	123	1	3000.00	0.00	card	2026-03-19	\N	2026-03-19 12:58:38.916292+00	12:58:38.916292	\N
150	56	8	16800.00	0.00	card	2026-03-19	\N	2026-03-19 14:46:13.39299+00	14:46:13.39299	\N
152	124	2	6000.00	2500.00	card	2026-03-19	lab_note=cbct	2026-03-19 15:51:15.546724+00	15:51:15.546724	25
154	126	1	1200.00	0.00	cash	2026-03-19	\N	2026-03-19 17:06:51.008714+00	17:06:51.008714	\N
158	127	8	2200.00	0.00	cash	2026-03-20	\N	2026-03-20 09:33:43.583448+00	09:33:43.583448	\N
51	49	2	1000.00	0.00	card	2026-03-13	\N	2026-03-13 08:39:09.757824+00	08:39:09.757824	10
52	50	2	1000.00	0.00	card	2026-03-13	\N	2026-03-13 08:56:01.20617+00	08:56:01.20617	10
53	51	2	1000.00	0.00	card	2026-03-13	\N	2026-03-13 09:31:09.071871+00	09:31:09.071871	10
75	69	2	8000.00	0.00	card	2026-03-14	\N	2026-03-14 16:12:52.541942+00	16:12:52.541942	10
156	27	9	2700.00	0.00	card	2026-03-20	\N	2026-03-20 08:27:58.199433+00	08:27:58.199433	28
26	27	9	4000.00	0.00	card	2026-03-11	\N	2026-03-11 08:44:22.690577+00	08:44:22.690577	15
28	29	9	6500.00	0.00	card	2026-03-11	\N	2026-03-11 10:09:51.992418+00	10:09:51.992418	15
83	75	3	23700.00	0.00	cash	2026-03-15	\N	2026-03-15 10:41:43.152387+00	10:41:43.152387	16
89	81	3	500.00	0.00	card	2026-03-15	\N	2026-03-15 11:55:10.96644+00	11:55:10.96644	16
93	85	3	21600.00	0.00	cash	2026-03-15	\N	2026-03-15 14:20:40.897163+00	14:20:40.897163	16
94	85	3	1000.00	0.00	card	2026-03-15	\N	2026-03-15 14:21:17.889821+00	14:21:17.889821	16
54	51	8	2200.00	0.00	card	2026-03-13	\N	2026-03-13 09:31:22.684606+00	09:31:22.684606	17
55	52	8	2500.00	0.00	card	2026-03-13	\N	2026-03-13 09:31:40.241488+00	09:31:40.241488	17
59	56	8	2200.00	0.00	card	2026-03-13	\N	2026-03-13 13:48:41.853522+00	13:48:41.853522	17
62	58	8	4900.00	0.00	card	2026-03-13	\N	2026-03-13 14:14:20.71519+00	14:14:20.71519	17
15	16	1	2500.00	0.00	card	2026-03-10	\N	2026-03-10 15:55:07.770461+00	15:55:07.770461	19
16	17	1	3500.00	0.00	card	2026-03-10	\N	2026-03-10 15:55:54.77779+00	15:55:54.77779	19
17	18	1	700.00	0.00	cash	2026-03-10	\N	2026-03-10 15:56:16.8557+00	15:56:16.8557	19
18	19	1	1500.00	0.00	card	2026-03-10	\N	2026-03-10 15:56:35.709707+00	15:56:35.709707	19
21	22	1	2500.00	0.00	card	2026-03-10	\N	2026-03-10 16:07:44.525037+00	16:07:44.525037	19
22	23	1	500.00	0.00	card	2026-03-10	\N	2026-03-10 16:59:36.764693+00	16:59:36.764693	19
24	25	1	1500.00	0.00	cash	2026-03-10	\N	2026-03-10 18:30:02.197555+00	18:30:02.197555	19
25	26	1	3500.00	0.00	cash	2026-03-10	\N	2026-03-10 18:53:13.217792+00	18:53:13.217792	19
31	30	1	2500.00	0.00	cash	2026-03-11	\N	2026-03-11 13:26:22.380429+00	13:26:22.380429	19
35	34	1	3400.00	0.00	cash	2026-03-11	\N	2026-03-11 16:13:10.44234+00	16:13:10.44234	19
46	44	1	5000.00	0.00	card	2026-03-12	\N	2026-03-12 13:48:05.053734+00	13:48:05.053734	19
48	46	1	3000.00	0.00	card	2026-03-12	\N	2026-03-12 14:27:48.444071+00	14:27:48.444071	19
61	57	1	7000.00	0.00	cash	2026-03-13	\N	2026-03-13 14:11:50.314328+00	14:11:50.314328	19
111	98	8	800.00	0.00	card	2026-03-16	\N	2026-03-16 12:51:17.196109+00	12:51:17.196109	\N
113	92	1	3000.00	0.00	cash	2026-03-16	\N	2026-03-16 13:53:47.095207+00	13:53:47.095207	\N
68	64	10	3400.00	0.00	card	2026-03-14	anestezie 200 Kc, extrakce + gelaspony 3200 Kc = 3400Kc	2026-03-14 08:49:47.10496+00	08:49:47.10496	11
69	65	10	7400.00	0.00	card	2026-03-14	\N	2026-03-14 10:55:33.286135+00	10:55:33.286135	11
74	68	10	2500.00	0.00	card	2026-03-14	\N	2026-03-14 15:48:27.38316+00	15:48:27.38316	11
76	70	10	700.00	0.00	card	2026-03-14	\N	2026-03-14 16:13:52.426851+00	16:13:52.426851	11
78	71	10	500.00	0.00	cash	2026-03-14	\N	2026-03-14 17:40:38.816128+00	17:40:38.816128	11
79	64	10	3900.00	0.00	card	2026-03-14	\N	2026-03-14 18:40:43.08098+00	18:40:43.08098	11
82	74	10	1000.00	0.00	card	2026-03-15	absolute cinema to bylo dite 4 let	2026-03-15 09:08:26.552783+00	09:08:26.552783	11
86	78	10	500.00	0.00	card	2026-03-15	\N	2026-03-15 10:47:35.528558+00	10:47:35.528558	11
87	79	10	500.00	0.00	card	2026-03-15	\N	2026-03-15 10:48:05.413079+00	10:48:05.413079	11
88	80	10	9600.00	0.00	cash	2026-03-15	\N	2026-03-15 11:36:52.609321+00	11:36:52.609321	11
91	83	10	1700.00	0.00	card	2026-03-15	\N	2026-03-15 13:05:49.549149+00	13:05:49.549149	11
92	84	10	4500.00	0.00	card	2026-03-15	\N	2026-03-15 14:19:46.222485+00	14:19:46.222485	11
117	70	1	2000.00	0.00	card	2026-03-16	\N	2026-03-16 15:59:02.034311+00	15:59:02.034311	\N
115	100	2	1400.00	0.00	cash	2026-03-16	\N	2026-03-16 15:18:38.718469+00	15:18:38.718469	20
119	5	1	500.00	0.00	cash	2026-03-16	\N	2026-03-16 18:06:03.559195+00	18:06:03.559195	\N
127	10	1	1000.00	0.00	cash	2026-03-17	\N	2026-03-17 15:06:14.533498+00	15:06:14.533498	\N
121	103	4	7000.00	0.00	card	2026-03-17	\N	2026-03-17 12:16:45.913526+00	12:16:45.913526	22
123	104	4	2500.00	0.00	cash	2026-03-17	\N	2026-03-17 13:15:29.353663+00	13:15:29.353663	22
97	33	3	1100.00	0.00	cash	2026-03-15	\N	2026-03-15 15:07:55.290365+00	15:07:55.290365	16
106	95	3	5000.00	0.00	cash	2026-03-15	\N	2026-03-15 16:05:37.908371+00	16:05:37.908371	16
125	105	4	1700.00	0.00	card	2026-03-17	\N	2026-03-17 14:03:00.251521+00	14:03:00.251521	22
129	35	4	3500.00	0.00	card	2026-03-17	\N	2026-03-17 17:43:39.509296+00	17:43:39.509296	\N
101	90	8	8000.00	4800.00	card	2026-03-09		2026-03-15 15:48:45.602168+00	15:48:45.602168	17
108	96	8	1600.00	0.00	cash	2026-03-16	\N	2026-03-16 09:28:14.083378+00	09:28:14.083378	\N
131	109	8	3000.00	0.00	card	2026-03-18	\N	2026-03-18 11:42:03.15638+00	11:42:03.15638	\N
65	61	1	14000.00	0.00	cash	2026-03-13	reendo	2026-03-13 15:47:53.015146+00	15:47:53.015146	19
66	62	1	2500.00	0.00	card	2026-03-13	\N	2026-03-13 16:36:40.550674+00	16:36:40.550674	19
67	63	1	2500.00	0.00	card	2026-03-13	\N	2026-03-13 17:52:29.608823+00	17:52:29.608823	19
84	76	1	3500.00	0.00	card	2026-03-15	\N	2026-03-15 10:45:16.959021+00	10:45:16.959021	19
85	77	1	3500.00	0.00	card	2026-03-15	\N	2026-03-15 10:46:14.273529+00	10:46:14.273529	19
90	82	1	2200.00	0.00	card	2026-03-15	dh	2026-03-15 11:55:34.503626+00	11:55:34.503626	19
95	86	1	3500.00	0.00	card	2026-03-15	\N	2026-03-15 14:29:17.103668+00	14:29:17.103668	19
96	87	1	3500.00	0.00	card	2026-03-15	\N	2026-03-15 14:29:43.487264+00	14:29:43.487264	19
98	88	1	9000.00	0.00	cash	2026-03-15	\N	2026-03-15 15:33:22.753379+00	15:33:22.753379	19
99	89	1	4000.00	0.00	cash	2026-03-09	\N	2026-03-15 15:47:07.139514+00	15:47:07.139514	19
100	33	1	1500.00	0.00	cash	2026-03-09	\N	2026-03-15 15:47:41.051553+00	15:47:41.051553	19
102	91	1	700.00	0.00	card	2026-03-09	\N	2026-03-15 15:49:22.440097+00	15:49:22.440097	19
103	92	1	5000.00	0.00	cash	2026-03-09	\N	2026-03-15 15:49:49.435815+00	15:49:49.435815	19
104	93	1	3000.00	0.00	cash	2026-03-09	\N	2026-03-15 15:50:24.302143+00	15:50:24.302143	19
105	94	1	700.00	0.00	cash	2026-03-09	\N	2026-03-15 15:50:47.115232+00	15:50:47.115232	19
107	1	1	5500.00	0.00	cash	2026-03-15	\N	2026-03-15 16:56:00.472587+00	16:56:00.472587	19
109	97	1	16700.00	7620.00	card	2026-03-16		2026-03-16 11:11:00.80976+00	11:11:00.80976	19
133	111	2	3000.00	0.00	card	2026-03-18	\N	2026-03-18 14:08:16.062736+00	14:08:16.062736	23
135	113	8	4000.00	0.00	card	2026-03-18	\N	2026-03-18 14:32:40.337107+00	14:32:40.337107	\N
137	115	1	3200.00	0.00	cash	2026-03-18	\N	2026-03-18 16:45:00.194995+00	16:45:00.194995	\N
139	117	1	7700.00	0.00	card	2026-03-18	\N	2026-03-18 17:58:07.102859+00	17:58:07.102859	\N
141	119	3	3000.00	0.00	card	2026-03-19	\N	2026-03-19 10:24:31.373946+00	10:24:31.373946	\N
143	120	3	3000.00	0.00	card	2026-03-19	\N	2026-03-19 11:07:21.025246+00	11:07:21.025246	\N
145	121	3	3000.00	0.00	card	2026-03-19	\N	2026-03-19 11:50:53.049592+00	11:50:53.049592	\N
147	122	8	12300.00	0.00	card	2026-03-19	\N	2026-03-19 12:22:25.465036+00	12:22:25.465036	\N
149	41	3	1000.00	0.00	card	2026-03-19	\N	2026-03-19 14:07:59.465266+00	14:07:59.465266	\N
151	115	1	2200.00	0.00	card	2026-03-19	\N	2026-03-19 15:50:23.456939+00	15:50:23.456939	\N
153	125	1	500.00	0.00	card	2026-03-19	\N	2026-03-19 16:28:53.496964+00	16:28:53.496964	\N
155	84	8	200.00	0.00	card	2026-03-20	\N	2026-03-20 08:20:35.997004+00	08:20:35.997004	\N
157	24	8	5000.00	2540.00	card	2026-03-20	lab_note=MK korunka	2026-03-20 08:59:57.750646+00	08:59:57.750646	\N
159	128	1	34100.00	13060.00	cash	2026-03-20	lab_note=4X MK, 1x csn	2026-03-20 10:06:16.778849+00	10:06:16.778849	\N
161	130	8	2700.00	0.00	cash	2026-03-20	\N	2026-03-20 10:46:38.643325+00	10:46:38.643325	\N
163	132	8	1200.00	0.00	card	2026-03-20	\N	2026-03-20 11:18:00.2435+00	11:18:00.2435	\N
164	133	1	3700.00	0.00	card	2026-03-20	\N	2026-03-20 11:44:27.981392+00	11:44:27.981392	\N
167	135	8	3900.00	0.00	card	2026-03-20	\N	2026-03-20 12:03:32.465599+00	12:03:32.465599	\N
168	136	8	4200.00	0.00	card	2026-03-20	\N	2026-03-20 13:09:10.865576+00	13:09:10.865576	\N
169	110	1	4200.00	0.00	card	2026-03-20	\N	2026-03-20 13:09:30.093502+00	13:09:30.093502	\N
171	137	4	1400.00	0.00	card	2026-03-20	\N	2026-03-20 15:12:12.486287+00	15:12:12.486287	\N
172	19	1	3000.00	0.00	card	2026-03-20	\N	2026-03-20 15:57:06.382281+00	15:57:06.382281	\N
56	53	12	500.00	0.00	cash	2026-03-13	\N	2026-03-13 10:28:46.850426+00	10:28:46.850426	26
57	54	12	2000.00	0.00	card	2026-03-13	\N	2026-03-13 10:53:27.828911+00	10:53:27.828911	26
58	55	12	5100.00	0.00	cash	2026-03-13	\N	2026-03-13 12:25:17.626651+00	12:25:17.626651	26
60	56	12	4500.00	0.00	card	2026-03-13	\N	2026-03-13 13:48:54.436898+00	13:48:54.436898	26
63	59	12	5000.00	0.00	card	2026-03-13	\N	2026-03-13 14:40:21.011814+00	14:40:21.011814	26
64	60	12	3000.00	0.00	card	2026-03-13	\N	2026-03-13 15:25:39.603454+00	15:25:39.603454	26
160	129	12	3000.00	0.00	card	2026-03-20	\N	2026-03-20 10:29:52.423956+00	10:29:52.423956	26
162	131	12	1000.00	0.00	card	2026-03-20	\N	2026-03-20 11:15:25.790112+00	11:15:25.790112	26
165	134	12	4200.00	0.00	cash	2026-03-20	\N	2026-03-20 11:55:40.502379+00	11:55:40.502379	26
170	130	12	11600.00	0.00	cash	2026-03-20	\N	2026-03-20 15:09:38.957917+00	15:09:38.957917	26
173	138	1	2000.00	2000.00	card	2026-03-20	lab_note=cbct	2026-03-20 17:13:46.241377+00	17:13:46.241377	\N
174	139	4	4200.00	0.00	card	2026-03-20	\N	2026-03-20 17:18:21.924852+00	17:18:21.924852	\N
175	140	4	3500.00	0.00	card	2026-03-20	\N	2026-03-20 17:22:23.169827+00	17:22:23.169827	\N
166	111	2	1000.00	0.00	card	2026-03-20	\N	2026-03-20 11:56:05.601822+00	11:56:05.601822	27
176	124	2	3500.00	0.00	cash	2026-03-20	\N	2026-03-20 17:35:45.491157+00	17:35:45.491157	27
177	141	1	3000.00	0.00	card	2026-03-20	\N	2026-03-20 17:43:49.84831+00	17:43:49.84831	\N
178	142	1	900.00	0.00	cash	2026-03-20	\N	2026-03-20 18:09:50.121278+00	18:09:50.121278	\N
179	143	4	2000.00	2000.00	cash	2026-03-21	lab_note=cbct	2026-03-21 08:58:09.864263+00	08:58:09.864263	\N
181	14	4	2000.00	0.00	card	2026-03-17	\N	2026-03-21 09:58:44.336201+00	09:58:44.336201	\N
183	146	4	5500.00	0.00	cash	2026-03-21	\N	2026-03-21 10:26:01.062766+00	10:26:01.062766	\N
180	144	9	3200.00	0.00	card	2026-03-21	\N	2026-03-21 09:37:11.943113+00	09:37:11.943113	28
182	145	9	3700.00	0.00	card	2026-03-21	\N	2026-03-21 10:25:38.940628+00	10:25:38.940628	28
184	147	4	2500.00	0.00	cash	2026-03-21	\N	2026-03-21 10:59:28.723222+00	10:59:28.723222	\N
185	148	4	500.00	0.00	cash	2026-03-21	\N	2026-03-21 11:23:18.479638+00	11:23:18.479638	\N
186	149	4	3500.00	0.00	card	2026-03-21	\N	2026-03-21 12:29:27.748202+00	12:29:27.748202	\N
187	150	4	2500.00	0.00	cash	2026-03-21	\N	2026-03-21 12:43:28.29334+00	12:43:28.29334	\N
188	151	4	3700.00	0.00	cash	2026-03-21	\N	2026-03-21 13:47:23.056635+00	13:47:23.056635	\N
189	152	4	2200.00	0.00	card	2026-03-21	\N	2026-03-21 15:08:24.376278+00	15:08:24.376278	\N
190	153	2	5000.00	2000.00	card	2026-03-21	lab_note=cbct	2026-03-21 16:11:35.720279+00	16:11:35.720279	29
191	154	2	500.00	0.00	card	2026-03-21	\N	2026-03-21 16:27:14.451134+00	16:27:14.451134	29
192	155	4	3000.00	0.00	cash	2026-03-21	\N	2026-03-21 17:09:48.537972+00	17:09:48.537972	\N
\.


--
-- Data for Name: medicine_presets; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.medicine_presets (id, name, created_at) FROM stdin;
1	Nimesil	2026-03-10 15:57:21.79143+00
2	Amoksiklav	2026-03-10 15:57:27.924459+00
3	Aulin	2026-03-10 15:57:29.888399+00
4	Augmentin	2026-03-10 15:57:33.223499+00
5	Ciprofloxacin	2026-03-10 15:57:47.926874+00
6	Dalacin C 150	2026-03-10 15:57:57.879891+00
7	Dalacin C 300	2026-03-10 15:58:04.054483+00
\.


--
-- Data for Name: outcome_categories; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.outcome_categories (id, name) FROM stdin;
1	materials
2	rent
3	utilities
4	equipment
5	other
\.


--
-- Data for Name: outcome_records; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.outcome_records (id, category_id, amount, expense_date, description, created_at, vendor, expense_time) FROM stdin;
1	5	1500.00	2026-03-12	 členstni v stomatologicke komore	2026-03-12 14:56:25.752071+00	\N	14:56:25.752071
2	5	480.00	2026-03-12	balik pro karlinDent	2026-03-12 16:52:28.773559+00	\N	16:52:28.773559
3	1	2500.00	2026-03-13	наконечники	2026-03-13 15:13:11.759525+00	\N	15:13:11.759525
4	4	1800.00	2026-03-13	даша заказ temu для клиники	2026-03-13 15:14:05.547132+00	\N	15:14:05.547132
5	2	280000.00	2026-03-15		2026-03-15 15:52:22.846964+00	\N	15:52:22.846964
6	5	5000.00	2026-03-16		2026-03-16 16:16:23.810209+00	\N	16:16:23.810209
7	5	10000.00	2026-03-16		2026-03-16 16:18:57.832378+00	\N	16:18:57.832378
8	5	4500.00	2026-03-18		2026-03-18 16:05:51.071619+00	\N	16:05:51.071619
9	5	4000.00	2026-03-20	meta advertisement	2026-03-20 15:17:43.235437+00	\N	15:17:43.235437
10	5	19000.00	2026-03-20	googlepay	2026-03-20 15:18:19.335022+00	\N	15:18:19.335022
\.


--
-- Data for Name: patients; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.patients (id, first_name, last_name, phone, street_address, city, zip_code, email, created_at) FROM stdin;
1	Mykola	Borodach	\N	\N	\N	\N	\N	2026-03-08 13:01:55.734977+00
4	\N	Loginova	\N	\N	\N	\N	\N	2026-03-08 15:13:28.112376+00
5	Roman	Janostak	\N	\N	\N	\N	\N	2026-03-08 15:15:52.845412+00
6	Vladyslav	Golovatyi	\N	\N	\N	\N	\N	2026-03-08 15:17:17.91913+00
7	Yaroslav	Rejpari	\N	\N	\N	\N	\N	2026-03-08 15:17:58.113181+00
8	Yurii	Kornouty	\N	\N	\N	\N	\N	2026-03-08 15:18:31.680187+00
9	Ihor	Romanets	\N	\N	\N	\N	\N	2026-03-08 15:19:29.47614+00
10	Sergey	Polyanskiy	\N	\N	\N	\N	\N	2026-03-08 15:19:56.660599+00
11	Iyad	Khalaila	\N	\N	\N	\N	\N	2026-03-08 16:16:02.654468+00
12	Jana	Kellermannova	\N	\N	\N	\N	\N	2026-03-08 16:26:19.321186+00
13	Min	Liliya	\N	\N	\N	\N	\N	2026-03-08 17:20:42.087108+00
14	Halyna	Smotylevych	\N	\N	\N	\N	\N	2026-03-08 17:21:47.739485+00
15	Palina	Prakapovich	\N	\N	\N	\N	\N	2026-03-08 17:22:25.274852+00
16	Patrik	Tomanek	\N	\N	\N	\N	\N	2026-03-10 15:55:07.770461+00
17	Fedor	Thurzo	\N	\N	\N	\N	\N	2026-03-10 15:55:54.77779+00
18	Yurii	Vitenko	\N	\N	\N	\N	\N	2026-03-10 15:56:16.8557+00
19	Ksenia	Kostyukovskiy	\N	\N	\N	\N	\N	2026-03-10 15:56:35.709707+00
20	Tatiana	Meridzhanova	\N	\N	\N	\N	\N	2026-03-10 15:59:11.774802+00
21	Aleksandra	Manakova	\N	\N	\N	\N	\N	2026-03-10 16:02:34.476467+00
22	Vit	Mraz	\N	\N	\N	\N	\N	2026-03-10 16:07:44.525037+00
23	Mykhailo	Hryhulka	\N	\N	\N	\N	\N	2026-03-10 16:59:36.764693+00
24	Ondrej	Kasal	\N	\N	\N	\N	\N	2026-03-10 17:10:56.841327+00
25	Bohdan	Vasylenko	\N	\N	\N	\N	\N	2026-03-10 18:30:02.197555+00
26	Jan	Javurek	\N	\N	\N	\N	\N	2026-03-10 18:53:13.217792+00
27	Ivan	Sushanyn	\N	\N	\N	\N	\N	2026-03-11 08:44:22.690577+00
28	\N	Pankratova	\N	\N	\N	\N	\N	2026-03-11 09:15:37.070987+00
29	\N	Kopyl	\N	\N	\N	\N	\N	2026-03-11 10:09:51.992418+00
30	\N	Vertikov	\N	\N	\N	\N	\N	2026-03-11 13:26:22.380429+00
31	\N	Hummerova	\N	\N	\N	\N	\N	2026-03-11 14:32:51.910416+00
32	\N	Tylova	\N	\N	\N	\N	\N	2026-03-11 15:04:33.672786+00
33	Ivan	Chepa	\N	\N	\N	\N	\N	2026-03-11 15:42:17.140142+00
34	Ekaterina	Neznakhina	\N	\N	\N	\N	\N	2026-03-11 16:13:10.44234+00
35	Andrii	Dubickyi	\N	\N	\N	\N	\N	2026-03-11 16:29:40.795165+00
36	Marie	Fuksova	\N	\N	\N	\N	\N	2026-03-11 16:52:07.502546+00
37	\N	Beztilna	\N	\N	\N	\N	\N	2026-03-12 09:57:32.669525+00
38	\N	Svedova	\N	\N	\N	\N	\N	2026-03-12 10:18:02.991721+00
39	\N	Burenko	\N	\N	\N	\N	\N	2026-03-12 10:56:56.406322+00
40	\N	Zelenkova	\N	\N	\N	\N	\N	2026-03-12 11:38:48.877406+00
41	\N	Hluscova	\N	\N	\N	\N	\N	2026-03-12 13:14:14.20315+00
42	\N	Jechova	\N	\N	\N	\N	\N	2026-03-12 13:42:14.319029+00
43	\N	Dobrovolska	\N	\N	\N	\N	\N	2026-03-12 13:44:22.842197+00
44	\N	Rusnakova	\N	\N	\N	\N	\N	2026-03-12 13:48:05.053734+00
45	\N	Susienka	\N	\N	\N	\N	\N	2026-03-12 14:19:47.041585+00
46	\N	Zsigmund	\N	\N	\N	\N	\N	2026-03-12 14:27:48.444071+00
47	Anastasia	Sablovskaja	\N	\N	\N	\N	\N	2026-03-12 16:04:43.45169+00
48	Tabriz	Mamedov	\N	\N	\N	\N	\N	2026-03-12 18:02:35.51661+00
49	\N	Popova	\N	\N	\N	\N	\N	2026-03-13 08:39:09.757824+00
50	\N	Smolina	\N	\N	\N	\N	\N	2026-03-13 08:56:01.20617+00
51	\N	Tykhonenko	\N	\N	\N	\N	\N	2026-03-13 09:31:09.071871+00
52	\N	Konstantin	\N	\N	\N	\N	\N	2026-03-13 09:31:40.241488+00
53	\N	Strouf	\N	\N	\N	\N	\N	2026-03-13 10:28:46.850426+00
54	\N	Jani	\N	\N	\N	\N	\N	2026-03-13 10:53:27.828911+00
55	\N	Janko	\N	\N	\N	\N	\N	2026-03-13 12:25:17.626651+00
56	\N	Boychev	\N	\N	\N	\N	\N	2026-03-13 13:48:41.853522+00
57	\N	Louszka	\N	\N	\N	\N	\N	2026-03-13 14:11:50.314328+00
58	\N	Iskusnykh	\N	\N	\N	\N	\N	2026-03-13 14:14:20.71519+00
59	\N	Humbatova	\N	\N	\N	\N	\N	2026-03-13 14:40:21.011814+00
60	Jan	Kaftan	\N	\N	\N	\N	\N	2026-03-13 15:25:39.603454+00
61	Vaclav	Pavlis	\N	\N	\N	\N	\N	2026-03-13 15:47:53.015146+00
62	Marcela	Heislerova	\N	\N	\N	\N	\N	2026-03-13 16:36:40.550674+00
63	Jakub	Curik	\N	\N	\N	\N	\N	2026-03-13 17:52:29.608823+00
64	Safuan	Jweid	\N	\N	\N	\N	\N	2026-03-14 08:49:47.10496+00
65	Vera	Dlabolova	\N	\N	\N	\N	\N	2026-03-14 10:55:33.286135+00
66	Lukas	Petricek	\N	\N	\N	\N	\N	2026-03-14 10:55:50.079833+00
67	Roman	Schcherba	\N	\N	\N	\N	\N	2026-03-14 11:36:00.192169+00
68	Miloslav	Jani	\N	\N	\N	\N	\N	2026-03-14 15:48:27.38316+00
69	Assel	Kassimova	\N	\N	\N	\N	\N	2026-03-14 16:12:52.541942+00
70	Silva	Rusnakova	\N	\N	\N	\N	\N	2026-03-14 16:13:52.426851+00
71	Oleksandra	Starosta	\N	\N	\N	\N	\N	2026-03-14 17:40:38.816128+00
72	Oleksii	Oliinyk	\N	\N	\N	\N	\N	2026-03-14 18:47:21.503137+00
73	Veronika	Drobot	\N	\N	\N	\N	\N	2026-03-14 18:49:44.818591+00
74	Pavlina	Ruzickova	\N	\N	\N	\N	\N	2026-03-15 09:08:26.552783+00
75	Volodymyr	Horenok	\N	\N	\N	\N	\N	2026-03-15 10:41:43.152387+00
76	Tetiana	Halushchak	\N	\N	\N	\N	\N	2026-03-15 10:45:16.959021+00
77	Oleksandr	Haluschak	\N	\N	\N	\N	\N	2026-03-15 10:46:14.273529+00
78	Monika	Polakova	\N	\N	\N	\N	\N	2026-03-15 10:47:35.528558+00
79	Dita	Krizova	\N	\N	\N	\N	\N	2026-03-15 10:48:05.413079+00
80	Danylo	Kuznets	\N	\N	\N	\N	\N	2026-03-15 11:36:52.609321+00
81	Margarita	Ponomar	\N	\N	\N	\N	\N	2026-03-15 11:55:10.96644+00
82	Artem	Voronin	\N	\N	\N	\N	\N	2026-03-15 11:55:34.503626+00
83	Lenka	Soldanova	\N	\N	\N	\N	\N	2026-03-15 13:05:49.549149+00
84	Jan	Nemet	\N	\N	\N	\N	\N	2026-03-15 14:19:46.222485+00
85	Andriy	Vysochanskyy	\N	\N	\N	\N	\N	2026-03-15 14:20:40.897163+00
86	Vitaliy	Iliuk	\N	\N	\N	\N	\N	2026-03-15 14:29:17.103668+00
87	Yuliia	Iliuk	\N	\N	\N	\N	\N	2026-03-15 14:29:43.487264+00
88	Mikhailo	Palukh	\N	\N	\N	\N	\N	2026-03-15 15:33:22.753379+00
89	Yuliia	Zubenko	\N	\N	\N	\N	\N	2026-03-15 15:47:07.139514+00
90	Vladimira	Dostalova	\N	\N	\N	\N	\N	2026-03-15 15:48:45.602168+00
91	Ruslana	Lendyel	\N	\N	\N	\N	\N	2026-03-15 15:49:22.440097+00
92	Hynek	Bila	\N	\N	\N	\N	\N	2026-03-15 15:49:49.435815+00
93	Dominik	Suchanek	\N	\N	\N	\N	\N	2026-03-15 15:50:24.302143+00
94	Maya	Humbatova	\N	\N	\N	\N	\N	2026-03-15 15:50:47.115232+00
95	Anton	Chorba	\N	\N	\N	\N	\N	2026-03-15 16:05:37.908371+00
96	\N	Ivanochnko	\N	\N	\N	\N	\N	2026-03-16 09:28:14.083378+00
97	\N	Malecky	\N	\N	\N	\N	\N	2026-03-16 11:11:00.80976+00
98	\N	Mumladze	\N	\N	\N	\N	\N	2026-03-16 12:51:17.196109+00
99	\N	Kremsaliuk	\N	\N	\N	\N	\N	2026-03-16 13:00:43.667036+00
100	\N	Badun	\N	\N	\N	\N	\N	2026-03-16 15:18:38.718469+00
101	Olga	Bubnova	\N	\N	\N	\N	\N	2026-03-16 15:58:43.051129+00
102	Martin	Svrcina	\N	\N	\N	\N	\N	2026-03-16 18:02:32.088986+00
103	\N	Cepelak	\N	\N	\N	\N	\N	2026-03-17 12:16:45.913526+00
104	\N	Halaktionova	\N	\N	\N	\N	\N	2026-03-17 13:15:29.353663+00
105	\N	Matuska	\N	\N	\N	\N	\N	2026-03-17 14:02:45.413496+00
106	\N	Polyanskyi	\N	\N	\N	\N	\N	2026-03-17 15:02:43.755522+00
107	Sergey	Dobrushkin	\N	\N	\N	\N	\N	2026-03-17 16:44:45.094104+00
108	\N	Jozsova	\N	\N	\N	\N	\N	2026-03-18 11:18:21.300804+00
109	\N	Kolar	\N	\N	\N	\N	\N	2026-03-18 11:42:03.15638+00
110	\N	Fabian	\N	\N	\N	\N	\N	2026-03-18 12:02:34.434853+00
111	\N	Proskurina	\N	\N	\N	\N	\N	2026-03-18 14:08:16.062736+00
112	\N	Leontiev	\N	\N	\N	\N	\N	2026-03-18 14:17:53.353063+00
113	\N	Dostalova	\N	\N	\N	\N	\N	2026-03-18 14:32:40.337107+00
114	Pavlo	Karatnyskyi	\N	\N	\N	\N	\N	2026-03-18 15:36:37.993035+00
115	Igor	Chotinskij	\N	\N	\N	\N	\N	2026-03-18 16:45:00.194995+00
116	Alexandra	Oosterling	\N	\N	\N	\N	\N	2026-03-18 16:45:13.088119+00
117	Maksym	Hanchak	\N	\N	\N	\N	\N	2026-03-18 17:58:07.102859+00
118	\N	Novikova	\N	\N	\N	\N	\N	2026-03-19 09:51:11.442586+00
119	\N	Kamaradkova	\N	\N	\N	\N	\N	2026-03-19 10:24:31.373946+00
120	\N	Karamzina	\N	\N	\N	\N	\N	2026-03-19 11:07:21.025246+00
121	\N	Fischer	\N	\N	\N	\N	\N	2026-03-19 11:50:53.049592+00
122	\N	Korotenko	\N	\N	\N	\N	\N	2026-03-19 12:22:13.62636+00
123	\N	Reznik	\N	\N	\N	\N	\N	2026-03-19 12:58:38.916292+00
124	Yelyzaveta	Pitakova	\N	\N	\N	\N	\N	2026-03-19 15:51:15.546724+00
125	Kamila	Amin	\N	\N	\N	\N	\N	2026-03-19 16:28:53.496964+00
126	Marjan	Kolida	\N	\N	\N	\N	\N	2026-03-19 17:06:51.008714+00
127	\N	Samaz	\N	\N	\N	\N	\N	2026-03-20 09:33:43.583448+00
128	\N	Golokha	\N	\N	\N	\N	\N	2026-03-20 10:06:16.778849+00
129	\N	Zakri	\N	\N	\N	\N	\N	2026-03-20 10:29:52.423956+00
130	\N	Yovdiy	\N	\N	\N	\N	\N	2026-03-20 10:46:38.643325+00
131	\N	Tonevitskaia	\N	\N	\N	\N	\N	2026-03-20 11:15:25.790112+00
132	\N	Loder	\N	\N	\N	\N	\N	2026-03-20 11:18:00.2435+00
133	Jakub	Kotaliuk	\N	\N	\N	\N	\N	2026-03-20 11:44:27.981392+00
134	Arsen	Utegenov	\N	\N	\N	\N	\N	2026-03-20 11:55:40.502379+00
135	\N	Akulich	\N	\N	\N	\N	\N	2026-03-20 12:03:32.465599+00
136	Michaela	Smidova	\N	\N	\N	\N	\N	2026-03-20 13:09:10.865576+00
137	Dan	Holomy	\N	\N	\N	\N	\N	2026-03-20 15:12:12.486287+00
138	Ivan	Kurta	\N	\N	\N	\N	\N	2026-03-20 17:13:46.241377+00
139	Dana	Valentova	\N	\N	\N	\N	\N	2026-03-20 17:18:21.924852+00
140	Alena	Pacalova	\N	\N	\N	\N	\N	2026-03-20 17:22:23.169827+00
141	Oleksandr	Lesnyi	\N	\N	\N	\N	\N	2026-03-20 17:43:49.84831+00
142	Stepan	Lareonov	\N	\N	\N	\N	\N	2026-03-20 18:09:50.121278+00
143	Nataliia	Obrovska	\N	\N	\N	\N	\N	2026-03-21 08:58:09.864263+00
144	Ivan	Kotliar	\N	\N	\N	\N	\N	2026-03-21 09:37:11.943113+00
145	Rostyslav	Kopyl	\N	\N	\N	\N	\N	2026-03-21 10:25:38.940628+00
146	Olena	Onoprijak	\N	\N	\N	\N	\N	2026-03-21 10:26:01.062766+00
147	Sergey	Dvoroviy	\N	\N	\N	\N	\N	2026-03-21 10:59:28.723222+00
148	Radek	Hornik	\N	\N	\N	\N	\N	2026-03-21 11:23:18.479638+00
149	Oksana	Panchenko	\N	\N	\N	\N	\N	2026-03-21 12:29:27.748202+00
150	Jevhenii	Volchok	\N	\N	\N	\N	\N	2026-03-21 12:43:28.29334+00
151	Vitalii	Lysak	\N	\N	\N	\N	\N	2026-03-21 13:47:23.056635+00
152	Adela	Maljukovova	\N	\N	\N	\N	\N	2026-03-21 15:08:24.376278+00
153	Alexandra	Bagrianceva	\N	\N	\N	\N	\N	2026-03-21 16:11:35.720279+00
154	Tetiana	Loginova	\N	\N	\N	\N	\N	2026-03-21 16:27:14.451134+00
155	Oleh	Tsebrenko	\N	\N	\N	\N	\N	2026-03-21 17:09:48.537972+00
\.


--
-- Data for Name: salary_adjustments; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.salary_adjustments (id, staff_id, amount, reason, applied_to_salary_payment_id, created_at) FROM stdin;
\.


--
-- Data for Name: salary_amount_audit; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.salary_amount_audit (id, staff_id, salary_payment_id, previous_amount, new_amount, delta_amount, change_source, change_reason, changed_by_staff_id, metadata, created_at) FROM stdin;
1	5	9	200.00	1.00	-199.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-14", "from": "2026-02-28", "role": "administrator", "payment_date": "2026-03-14", "has_signature_payload": true}	2026-03-14 14:14:26.109411+00
2	2	10	5500.00	5500.00	0.00	manual_override	calculated_value	1	{"to": "2026-03-14", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-14", "has_signature_payload": true}	2026-03-14 16:17:17.320596+00
3	10	11	14480.00	16000.00	1520.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-15", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-15", "has_signature_payload": true}	2026-03-15 14:31:31.298873+00
4	16	12	300.00	5500.00	5200.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-15", "from": "2026-02-28", "role": "assistant", "payment_date": "2026-03-15", "has_signature_payload": true}	2026-03-15 15:10:35.200347+00
5	15	13	500.00	1.00	-499.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-15", "from": "2026-02-28", "role": "administrator", "payment_date": "2026-03-15", "has_signature_payload": true}	2026-03-15 15:12:40.023053+00
6	5	14	200.00	6000.00	5800.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-15", "from": "2026-02-28", "role": "administrator", "payment_date": "2026-03-15", "has_signature_payload": true}	2026-03-15 15:33:02.033279+00
7	9	15	3150.00	3200.00	50.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-15", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-15", "has_signature_payload": true}	2026-03-15 16:15:03.285943+00
8	3	16	21160.00	21200.00	40.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-15", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-15", "has_signature_payload": true}	2026-03-15 16:16:32.887273+00
9	8	17	6000.00	6000.00	0.00	auto_calculated	\N	1	{"to": null, "from": null, "role": "doctor", "payment_date": "2026-03-16", "has_signature_payload": false}	2026-03-16 08:41:41.742608+00
10	13	18	200.00	8400.00	8200.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-16", "from": "2026-02-28", "role": "assistant", "payment_date": "2026-03-16", "has_signature_payload": true}	2026-03-16 09:38:54.253499+00
11	1	19	33234.00	30000.00	-3234.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-16", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-16", "has_signature_payload": true}	2026-03-16 11:13:25.22575+00
12	2	20	1200.00	1200.00	0.00	manual_override	calculated_value	1	{"to": "2026-03-16", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-16", "has_signature_payload": true}	2026-03-16 16:01:38.413881+00
13	6	21	200.00	8800.00	8600.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-16", "from": "2026-02-28", "role": "assistant", "payment_date": "2026-03-16", "has_signature_payload": true}	2026-03-16 16:18:13.12228+00
14	4	22	18960.00	15700.00	-3260.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-17", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-17", "has_signature_payload": true}	2026-03-17 15:31:16.704477+00
15	2	23	1500.00	1500.00	0.00	auto_calculated	\N	1	{"to": null, "from": null, "role": "doctor", "payment_date": "2026-03-18", "has_signature_payload": false}	2026-03-18 14:20:35.803228+00
16	6	24	200.00	0.01	-199.99	manual_override	manual_ui_adjustment	1	{"to": "2026-03-18", "from": "2026-02-28", "role": "assistant", "payment_date": "2026-03-18", "has_signature_payload": true}	2026-03-18 14:50:48.566407+00
17	2	25	1750.00	2000.00	250.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-19", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-19", "has_signature_payload": true}	2026-03-19 16:10:38.197829+00
18	12	26	15960.00	31720.00	15760.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-20", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-20", "has_signature_payload": true}	2026-03-20 16:23:01.225237+00
19	2	27	2250.00	2300.00	50.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-20", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-20", "has_signature_payload": true}	2026-03-20 17:37:16.860389+00
20	9	28	2880.00	2900.00	20.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-21", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-21", "has_signature_payload": true}	2026-03-21 10:29:32.196252+00
21	2	29	1750.00	2000.00	250.00	manual_override	manual_ui_adjustment	1	{"to": "2026-03-21", "from": "2026-02-28", "role": "doctor", "payment_date": "2026-03-21", "has_signature_payload": true}	2026-03-21 16:30:45.461024+00
\.


--
-- Data for Name: salary_payments; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.salary_payments (id, staff_id, amount, payment_date, note, created_at) FROM stdin;
1	2	1250.00	2026-03-08		2026-03-08 15:14:23.640021+00
2	5	4400.00	2026-03-08		2026-03-08 17:50:18.219951+00
3	3	12400.00	2026-03-12		2026-03-12 14:46:58.838203+00
4	8	11000.00	2026-03-12	dluh 2000	2026-03-12 14:52:57.621219+00
5	7	10500.00	2026-03-12	должны 60 kc	2026-03-12 18:31:51.222415+00
6	5	1.00	2026-03-14		2026-03-14 10:41:00.807022+00
7	5	1.00	2026-03-14	Test	2026-03-14 11:09:48.879329+00
8	14	8000.00	2026-03-14		2026-03-14 11:55:26.982352+00
9	5	1.00	2026-03-14		2026-03-14 14:14:26.109411+00
10	2	5500.00	2026-03-14		2026-03-14 16:17:17.320596+00
11	10	16000.00	2026-03-15		2026-03-15 14:31:31.298873+00
12	16	5500.00	2026-03-15		2026-03-15 15:10:35.200347+00
13	15	1.00	2026-03-15		2026-03-15 15:12:40.023053+00
14	5	6000.00	2026-03-15	Dulh 400 kr	2026-03-15 15:33:02.033279+00
15	9	3200.00	2026-03-15		2026-03-15 16:15:03.285943+00
16	3	21200.00	2026-03-15		2026-03-15 16:16:32.887273+00
17	8	6000.00	2026-03-16		2026-03-16 08:41:41.742608+00
18	13	8400.00	2026-03-16		2026-03-16 09:38:54.253499+00
19	1	30000.00	2026-03-16		2026-03-16 11:13:25.22575+00
20	2	1200.00	2026-03-16		2026-03-16 16:01:38.413881+00
21	6	8800.00	2026-03-16		2026-03-16 16:18:13.12228+00
22	4	15700.00	2026-03-17		2026-03-17 15:31:16.704477+00
23	2	1500.00	2026-03-18		2026-03-18 14:20:35.803228+00
24	6	0.01	2026-03-18	-200	2026-03-18 14:50:48.566407+00
25	2	2000.00	2026-03-19	Next salary -200	2026-03-19 16:10:38.197829+00
26	12	31720.00	2026-03-20	Od 20.02	2026-03-20 16:23:01.225237+00
27	2	2300.00	2026-03-20		2026-03-20 17:37:16.860389+00
28	9	2900.00	2026-03-21		2026-03-21 10:29:32.196252+00
29	2	2000.00	2026-03-21	Next salary -200kc	2026-03-21 16:30:45.461024+00
\.


--
-- Data for Name: schedule_audit_logs; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.schedule_audit_logs (id, shift_id, action, changed_by, details, created_at) FROM stdin;
1	1	CREATE	1	{"staff_id": 1, "start_time": "2026-03-13T06:00:00.000Z", "end_time": "2026-03-13T14:00:00.000Z", "note": ""}	2026-03-13 17:51:48.984337+00
2	2	CREATE	1	{"staff_id": 4, "start_time": "2026-03-14T09:30:00.000Z", "end_time": "2026-03-14T19:00:00.000Z", "note": ""}	2026-03-13 18:57:12.64647+00
3	3	CREATE	1	{"staff_id": 10, "start_time": "2026-03-14T09:00:00.000Z", "end_time": "2026-03-14T17:00:00.000Z", "note": ""}	2026-03-14 08:48:59.688158+00
4	4	CREATE	1	{"staff_id": 2, "start_time": "2026-03-14T15:30:00.000Z", "end_time": "2026-03-14T16:00:00.000Z", "note": ""}	2026-03-14 14:51:08.065506+00
5	5	CREATE	1	{"staff_id": 5, "start_time": "2026-03-14T08:00:00.000Z", "end_time": "2026-03-14T18:00:00.000Z", "note": ""}	2026-03-14 14:51:34.707931+00
6	6	CREATE	1	{"staff_id": 5, "start_time": "2026-03-15T08:00:00.000Z", "end_time": "2026-03-15T19:00:00.000Z", "note": ""}	2026-03-14 17:43:52.997235+00
7	7	CREATE	1	{"staff_id": 3, "start_time": "2026-03-15T08:00:00.000Z", "end_time": "2026-03-15T16:00:00.000Z", "note": ""}	2026-03-14 17:44:09.370646+00
8	8	CREATE	1	{"staff_id": 10, "start_time": "2026-03-15T08:00:00.000Z", "end_time": "2026-03-15T16:00:00.000Z", "note": ""}	2026-03-14 17:44:13.29052+00
9	9	CREATE	1	{"staff_id": 1, "start_time": "2026-03-15T08:00:00.000Z", "end_time": "2026-03-15T16:00:00.000Z", "note": ""}	2026-03-14 17:44:16.251439+00
10	10	CREATE	1	{"staff_id": 8, "start_time": "2026-03-16T06:00:00.000Z", "end_time": "2026-03-16T14:00:00.000Z", "note": ""}	2026-03-15 13:28:24.329376+00
11	11	CREATE	1	{"staff_id": 1, "start_time": "2026-03-16T06:00:00.000Z", "end_time": "2026-03-16T14:00:00.000Z", "note": ""}	2026-03-15 13:28:29.402999+00
12	12	CREATE	1	{"staff_id": 2, "start_time": "2026-03-16T06:00:00.000Z", "end_time": "2026-03-16T14:00:00.000Z", "note": ""}	2026-03-15 13:28:31.083149+00
13	13	CREATE	1	{"staff_id": 15, "start_time": "2026-03-16T06:00:00.000Z", "end_time": "2026-03-16T14:00:00.000Z", "note": ""}	2026-03-15 13:28:34.264818+00
14	14	CREATE	1	{"staff_id": 6, "start_time": "2026-03-16T06:00:00.000Z", "end_time": "2026-03-16T14:00:00.000Z", "note": ""}	2026-03-15 13:28:37.263613+00
15	15	CREATE	1	{"staff_id": 1, "start_time": "2026-03-09T06:00:00.000Z", "end_time": "2026-03-09T14:00:00.000Z", "note": ""}	2026-03-15 15:46:19.05306+00
16	16	CREATE	1	{"staff_id": 8, "start_time": "2026-03-09T06:00:00.000Z", "end_time": "2026-03-09T14:00:00.000Z", "note": ""}	2026-03-15 15:46:27.326331+00
17	17	CREATE	1	{"staff_id": 8, "start_time": "2026-03-15T06:00:00.000Z", "end_time": "2026-03-15T14:00:00.000Z", "note": ""}	2026-03-15 17:16:36.651097+00
18	18	CREATE	1	{"staff_id": 14, "start_time": "2026-03-16T15:00:00.000Z", "end_time": "2026-03-16T19:00:00.000Z", "note": ""}	2026-03-16 10:10:24.390768+00
19	18	DELETE	1	{"deleted_record": [18, 14, "2026-03-16 15:00:00+00:00", "2026-03-16 19:00:00+00:00", "", "2026-03-16 10:10:24.390768+00:00", "2026-03-16 10:10:24.390768+00:00"]}	2026-03-16 10:10:45.384814+00
20	13	UPDATE	1	{"old": [15, "2026-03-16 06:00:00+00:00", "2026-03-16 14:00:00+00:00", ""], "new": {"staff_id": 15, "start_time": "2026-03-16T06:00:00.000Z", "end_time": "2026-03-16T15:00:00.000Z", "note": ""}}	2026-03-16 15:46:14.486562+00
21	14	UPDATE	1	{"old": [6, "2026-03-16 06:00:00+00:00", "2026-03-16 14:00:00+00:00", ""], "new": {"staff_id": 6, "start_time": "2026-03-16T10:30:00.000Z", "end_time": "2026-03-16T18:30:00.000Z", "note": ""}}	2026-03-16 15:46:33.07605+00
22	19	CREATE	1	{"staff_id": 14, "start_time": "2026-03-16T15:00:00.000Z", "end_time": "2026-03-16T18:30:00.000Z", "note": ""}	2026-03-16 15:46:43.082045+00
23	13	UPDATE	1	{"old": [15, "2026-03-16 06:00:00+00:00", "2026-03-16 15:00:00+00:00", ""], "new": {"staff_id": 15, "start_time": "2026-03-16T08:00:00.000Z", "end_time": "2026-03-16T15:00:00.000Z", "note": ""}}	2026-03-16 15:47:47.838655+00
24	20	CREATE	1	{"staff_id": 15, "start_time": "2026-03-17T09:00:00.000Z", "end_time": "2026-03-17T15:00:00.000Z", "note": ""}	2026-03-17 08:59:22.50136+00
25	21	CREATE	1	{"staff_id": 13, "start_time": "2026-03-16T08:00:00.000Z", "end_time": "2026-03-16T15:30:00.000Z", "note": ""}	2026-03-17 09:11:01.723509+00
26	22	CREATE	1	{"staff_id": 6, "start_time": "2026-03-17T08:30:00.000Z", "end_time": "2026-03-17T18:00:00.000Z", "note": ""}	2026-03-17 09:12:02.383082+00
27	23	CREATE	1	{"staff_id": 1, "start_time": "2026-03-17T09:00:00.000Z", "end_time": "2026-03-17T18:00:00.000Z", "note": ""}	2026-03-17 09:12:16.866742+00
28	24	CREATE	1	{"staff_id": 2, "start_time": "2026-03-17T09:00:00.000Z", "end_time": "2026-03-17T10:00:00.000Z", "note": ""}	2026-03-17 09:12:29.029414+00
29	25	CREATE	1	{"staff_id": 4, "start_time": "2026-03-17T11:00:00.000Z", "end_time": "2026-03-17T19:00:00.000Z", "note": ""}	2026-03-17 09:12:45.507252+00
30	26	CREATE	1	{"staff_id": 13, "start_time": "2026-03-17T10:20:00.000Z", "end_time": "2026-03-17T19:00:00.000Z", "note": ""}	2026-03-17 10:18:27.814575+00
31	27	CREATE	1	{"staff_id": 15, "start_time": "2026-03-18T10:20:00.000Z", "end_time": "2026-03-18T15:00:00.000Z", "note": ""}	2026-03-18 10:20:26.258234+00
32	28	CREATE	1	{"staff_id": 6, "start_time": "2026-03-18T10:20:00.000Z", "end_time": "2026-03-18T16:00:00.000Z", "note": ""}	2026-03-18 10:21:37.859353+00
33	29	CREATE	1	{"staff_id": 17, "start_time": "2026-03-18T10:30:00.000Z", "end_time": "2026-03-18T15:00:00.000Z", "note": ""}	2026-03-18 10:31:17.256503+00
34	30	CREATE	1	{"staff_id": 8, "start_time": "2026-03-18T11:00:00.000Z", "end_time": "2026-03-18T15:00:00.000Z", "note": ""}	2026-03-18 11:08:33.088164+00
35	31	CREATE	1	{"staff_id": 1, "start_time": "2026-03-18T11:00:00.000Z", "end_time": "2026-03-18T19:00:00.000Z", "note": ""}	2026-03-18 11:08:42.80554+00
36	32	CREATE	1	{"staff_id": 15, "start_time": "2026-03-13T08:00:00.000Z", "end_time": "2026-03-13T15:00:00.000Z", "note": ""}	2026-03-18 11:09:59.942684+00
37	33	CREATE	1	{"staff_id": 15, "start_time": "2026-03-12T08:00:00.000Z", "end_time": "2026-03-12T15:00:00.000Z", "note": ""}	2026-03-18 11:10:29.48608+00
38	34	CREATE	1	{"staff_id": 15, "start_time": "2026-03-11T08:00:00.000Z", "end_time": "2026-03-11T15:00:00.000Z", "note": ""}	2026-03-18 11:10:47.655857+00
39	35	CREATE	1	{"staff_id": 14, "start_time": "2026-03-10T10:30:00.000Z", "end_time": "2026-03-10T15:00:00.000Z", "note": ""}	2026-03-18 11:11:05.601064+00
40	35	UPDATE	1	{"old": [14, "2026-03-10 10:30:00+00:00", "2026-03-10 15:00:00+00:00", ""], "new": {"staff_id": 15, "start_time": "2026-03-10T10:30:00.000Z", "end_time": "2026-03-10T15:00:00.000Z", "note": ""}}	2026-03-18 11:11:10.853421+00
41	36	CREATE	1	{"staff_id": 15, "start_time": "2026-03-09T09:30:00.000Z", "end_time": "2026-03-09T16:30:00.000Z", "note": ""}	2026-03-18 11:13:59.504529+00
42	37	CREATE	1	{"staff_id": 15, "start_time": "2026-03-07T15:00:00.000Z", "end_time": "2026-03-07T19:00:00.000Z", "note": ""}	2026-03-18 11:14:45.09431+00
43	38	CREATE	1	{"staff_id": 15, "start_time": "2026-03-06T09:00:00.000Z", "end_time": "2026-03-06T11:00:00.000Z", "note": ""}	2026-03-18 11:15:04.035405+00
44	39	CREATE	1	{"staff_id": 15, "start_time": "2026-03-05T08:00:00.000Z", "end_time": "2026-03-05T15:00:00.000Z", "note": ""}	2026-03-18 11:15:26.038219+00
45	40	CREATE	1	{"staff_id": 15, "start_time": "2026-03-04T08:00:00.000Z", "end_time": "2026-03-04T15:00:00.000Z", "note": ""}	2026-03-18 11:15:41.356731+00
46	41	CREATE	1	{"staff_id": 15, "start_time": "2026-03-03T08:30:00.000Z", "end_time": "2026-03-03T15:00:00.000Z", "note": ""}	2026-03-18 11:16:03.075597+00
47	42	CREATE	1	{"staff_id": 15, "start_time": "2026-03-02T08:00:00.000Z", "end_time": "2026-03-02T15:00:00.000Z", "note": ""}	2026-03-18 11:16:15.500775+00
48	43	CREATE	1	{"staff_id": 2, "start_time": "2026-03-18T14:00:00.000Z", "end_time": "2026-03-18T15:00:00.000Z", "note": ""}	2026-03-18 14:08:01.335181+00
49	44	CREATE	1	{"staff_id": 3, "start_time": "2026-03-19T09:00:00.000Z", "end_time": "2026-03-19T14:00:00.000Z", "note": ""}	2026-03-19 09:50:58.247191+00
50	45	CREATE	1	{"staff_id": 8, "start_time": "2026-03-19T10:00:00.000Z", "end_time": "2026-03-19T15:00:00.000Z", "note": ""}	2026-03-19 09:51:23.606391+00
51	46	CREATE	1	{"staff_id": 1, "start_time": "2026-03-19T11:00:00.000Z", "end_time": "2026-03-19T17:00:00.000Z", "note": ""}	2026-03-19 09:51:34.125974+00
52	47	CREATE	1	{"staff_id": 13, "start_time": "2026-03-19T09:30:00.000Z", "end_time": "2026-03-19T15:00:00.000Z", "note": ""}	2026-03-19 09:52:53.077661+00
53	28	UPDATE	1	{"old": [6, "2026-03-18 10:20:00+00:00", "2026-03-18 16:00:00+00:00", ""], "new": {"staff_id": 6, "start_time": "2026-03-18T10:20:00.000Z", "end_time": "2026-03-18T19:00:00.000Z", "note": ""}}	2026-03-19 10:11:38.766251+00
54	48	CREATE	1	{"staff_id": 2, "start_time": "2026-03-19T09:00:00.000Z", "end_time": "2026-03-19T17:00:00.000Z", "note": ""}	2026-03-19 15:50:36.493425+00
55	49	CREATE	1	{"staff_id": 13, "start_time": "2026-03-20T07:30:00.000Z", "end_time": "2026-03-20T16:00:00.000Z", "note": ""}	2026-03-20 08:09:11.345285+00
56	50	CREATE	1	{"staff_id": 18, "start_time": "2026-03-20T07:30:00.000Z", "end_time": "2026-03-20T16:00:00.000Z", "note": ""}	2026-03-20 08:09:38.34579+00
57	51	CREATE	1	{"staff_id": 8, "start_time": "2026-03-20T08:00:00.000Z", "end_time": "2026-03-20T15:00:00.000Z", "note": ""}	2026-03-20 08:09:47.181454+00
58	52	CREATE	1	{"staff_id": 12, "start_time": "2026-03-20T09:00:00.000Z", "end_time": "2026-03-20T16:00:00.000Z", "note": ""}	2026-03-20 08:09:56.008453+00
59	53	CREATE	1	{"staff_id": 1, "start_time": "2026-03-20T11:00:00.000Z", "end_time": "2026-03-20T19:00:00.000Z", "note": ""}	2026-03-20 08:10:05.09692+00
60	54	CREATE	1	{"staff_id": 2, "start_time": "2026-03-20T10:30:00.000Z", "end_time": "2026-03-20T18:00:00.000Z", "note": ""}	2026-03-20 08:10:39.929953+00
61	55	CREATE	1	{"staff_id": 9, "start_time": "2026-03-20T08:00:00.000Z", "end_time": "2026-03-20T09:00:00.000Z", "note": ""}	2026-03-20 08:27:38.288214+00
62	56	CREATE	1	{"staff_id": 14, "start_time": "2026-03-20T10:30:00.000Z", "end_time": "2026-03-20T19:00:00.000Z", "note": ""}	2026-03-20 10:54:30.91664+00
63	56	DELETE	1	{"deleted_record": [56, 14, "2026-03-20 10:30:00+00:00", "2026-03-20 19:00:00+00:00", "", "2026-03-20 10:54:30.916640+00:00", "2026-03-20 10:54:30.916640+00:00"]}	2026-03-20 10:54:35.352146+00
64	57	CREATE	1	{"staff_id": 6, "start_time": "2026-03-20T10:30:00.000Z", "end_time": "2026-03-20T19:00:00.000Z", "note": ""}	2026-03-20 10:54:43.543658+00
65	50	UPDATE	1	{"old": [18, "2026-03-20 07:30:00+00:00", "2026-03-20 16:00:00+00:00", ""], "new": {"staff_id": 18, "start_time": "2026-03-20T07:30:00.000Z", "end_time": "2026-03-20T14:00:00.000Z", "note": ""}}	2026-03-20 14:15:16.211542+00
66	49	UPDATE	1	{"old": [13, "2026-03-20 07:30:00+00:00", "2026-03-20 16:00:00+00:00", ""], "new": {"staff_id": 13, "start_time": "2026-03-20T07:30:00.000Z", "end_time": "2026-03-20T17:30:00.000Z", "note": ""}}	2026-03-20 14:15:32.983348+00
67	58	CREATE	1	{"staff_id": 4, "start_time": "2026-03-20T15:00:00.000Z", "end_time": "2026-03-20T19:00:00.000Z", "note": ""}	2026-03-20 15:11:55.288841+00
68	59	CREATE	1	{"staff_id": 4, "start_time": "2026-03-21T08:00:00.000Z", "end_time": "2026-03-21T19:00:00.000Z", "note": ""}	2026-03-21 08:57:25.372529+00
69	60	CREATE	1	{"staff_id": 9, "start_time": "2026-03-21T09:00:00.000Z", "end_time": "2026-03-21T19:00:00.000Z", "note": ""}	2026-03-21 09:36:53.981303+00
70	61	CREATE	1	{"staff_id": 2, "start_time": "2026-03-21T06:00:00.000Z", "end_time": "2026-03-21T14:00:00.000Z", "note": ""}	2026-03-21 16:03:33.288338+00
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.shifts (id, staff_id, start_time, end_time, note, created_at, updated_at) FROM stdin;
1	1	2026-03-13 06:00:00+00	2026-03-13 14:00:00+00		2026-03-13 17:51:48.984337+00	2026-03-13 17:51:48.984337+00
2	4	2026-03-14 09:30:00+00	2026-03-14 19:00:00+00		2026-03-13 18:57:12.64647+00	2026-03-13 18:57:12.64647+00
3	10	2026-03-14 09:00:00+00	2026-03-14 17:00:00+00		2026-03-14 08:48:59.688158+00	2026-03-14 08:48:59.688158+00
4	2	2026-03-14 15:30:00+00	2026-03-14 16:00:00+00		2026-03-14 14:51:08.065506+00	2026-03-14 14:51:08.065506+00
5	5	2026-03-14 08:00:00+00	2026-03-14 18:00:00+00		2026-03-14 14:51:34.707931+00	2026-03-14 14:51:34.707931+00
6	5	2026-03-15 08:00:00+00	2026-03-15 19:00:00+00		2026-03-14 17:43:52.997235+00	2026-03-14 17:43:52.997235+00
7	3	2026-03-15 08:00:00+00	2026-03-15 16:00:00+00		2026-03-14 17:44:09.370646+00	2026-03-14 17:44:09.370646+00
8	10	2026-03-15 08:00:00+00	2026-03-15 16:00:00+00		2026-03-14 17:44:13.29052+00	2026-03-14 17:44:13.29052+00
9	1	2026-03-15 08:00:00+00	2026-03-15 16:00:00+00		2026-03-14 17:44:16.251439+00	2026-03-14 17:44:16.251439+00
10	8	2026-03-16 06:00:00+00	2026-03-16 14:00:00+00		2026-03-15 13:28:24.329376+00	2026-03-15 13:28:24.329376+00
11	1	2026-03-16 06:00:00+00	2026-03-16 14:00:00+00		2026-03-15 13:28:29.402999+00	2026-03-15 13:28:29.402999+00
12	2	2026-03-16 06:00:00+00	2026-03-16 14:00:00+00		2026-03-15 13:28:31.083149+00	2026-03-15 13:28:31.083149+00
15	1	2026-03-09 06:00:00+00	2026-03-09 14:00:00+00		2026-03-15 15:46:19.05306+00	2026-03-15 15:46:19.05306+00
16	8	2026-03-09 06:00:00+00	2026-03-09 14:00:00+00		2026-03-15 15:46:27.326331+00	2026-03-15 15:46:27.326331+00
17	8	2026-03-15 06:00:00+00	2026-03-15 14:00:00+00		2026-03-15 17:16:36.651097+00	2026-03-15 17:16:36.651097+00
14	6	2026-03-16 10:30:00+00	2026-03-16 18:30:00+00		2026-03-15 13:28:37.263613+00	2026-03-16 15:46:33.07605+00
19	14	2026-03-16 15:00:00+00	2026-03-16 18:30:00+00		2026-03-16 15:46:43.082045+00	2026-03-16 15:46:43.082045+00
13	15	2026-03-16 08:00:00+00	2026-03-16 15:00:00+00		2026-03-15 13:28:34.264818+00	2026-03-16 15:47:47.838655+00
20	15	2026-03-17 09:00:00+00	2026-03-17 15:00:00+00		2026-03-17 08:59:22.50136+00	2026-03-17 08:59:22.50136+00
21	13	2026-03-16 08:00:00+00	2026-03-16 15:30:00+00		2026-03-17 09:11:01.723509+00	2026-03-17 09:11:01.723509+00
22	6	2026-03-17 08:30:00+00	2026-03-17 18:00:00+00		2026-03-17 09:12:02.383082+00	2026-03-17 09:12:02.383082+00
23	1	2026-03-17 09:00:00+00	2026-03-17 18:00:00+00		2026-03-17 09:12:16.866742+00	2026-03-17 09:12:16.866742+00
24	2	2026-03-17 09:00:00+00	2026-03-17 10:00:00+00		2026-03-17 09:12:29.029414+00	2026-03-17 09:12:29.029414+00
25	4	2026-03-17 11:00:00+00	2026-03-17 19:00:00+00		2026-03-17 09:12:45.507252+00	2026-03-17 09:12:45.507252+00
26	13	2026-03-17 10:20:00+00	2026-03-17 19:00:00+00		2026-03-17 10:18:27.814575+00	2026-03-17 10:18:27.814575+00
27	15	2026-03-18 10:20:00+00	2026-03-18 15:00:00+00		2026-03-18 10:20:26.258234+00	2026-03-18 10:20:26.258234+00
29	17	2026-03-18 10:30:00+00	2026-03-18 15:00:00+00		2026-03-18 10:31:17.256503+00	2026-03-18 10:31:17.256503+00
30	8	2026-03-18 11:00:00+00	2026-03-18 15:00:00+00		2026-03-18 11:08:33.088164+00	2026-03-18 11:08:33.088164+00
31	1	2026-03-18 11:00:00+00	2026-03-18 19:00:00+00		2026-03-18 11:08:42.80554+00	2026-03-18 11:08:42.80554+00
32	15	2026-03-13 08:00:00+00	2026-03-13 15:00:00+00		2026-03-18 11:09:59.942684+00	2026-03-18 11:09:59.942684+00
33	15	2026-03-12 08:00:00+00	2026-03-12 15:00:00+00		2026-03-18 11:10:29.48608+00	2026-03-18 11:10:29.48608+00
34	15	2026-03-11 08:00:00+00	2026-03-11 15:00:00+00		2026-03-18 11:10:47.655857+00	2026-03-18 11:10:47.655857+00
35	15	2026-03-10 10:30:00+00	2026-03-10 15:00:00+00		2026-03-18 11:11:05.601064+00	2026-03-18 11:11:10.853421+00
36	15	2026-03-09 09:30:00+00	2026-03-09 16:30:00+00		2026-03-18 11:13:59.504529+00	2026-03-18 11:13:59.504529+00
37	15	2026-03-07 15:00:00+00	2026-03-07 19:00:00+00		2026-03-18 11:14:45.09431+00	2026-03-18 11:14:45.09431+00
38	15	2026-03-06 09:00:00+00	2026-03-06 11:00:00+00		2026-03-18 11:15:04.035405+00	2026-03-18 11:15:04.035405+00
39	15	2026-03-05 08:00:00+00	2026-03-05 15:00:00+00		2026-03-18 11:15:26.038219+00	2026-03-18 11:15:26.038219+00
40	15	2026-03-04 08:00:00+00	2026-03-04 15:00:00+00		2026-03-18 11:15:41.356731+00	2026-03-18 11:15:41.356731+00
41	15	2026-03-03 08:30:00+00	2026-03-03 15:00:00+00		2026-03-18 11:16:03.075597+00	2026-03-18 11:16:03.075597+00
42	15	2026-03-02 08:00:00+00	2026-03-02 15:00:00+00		2026-03-18 11:16:15.500775+00	2026-03-18 11:16:15.500775+00
43	2	2026-03-18 14:00:00+00	2026-03-18 15:00:00+00		2026-03-18 14:08:01.335181+00	2026-03-18 14:08:01.335181+00
44	3	2026-03-19 09:00:00+00	2026-03-19 14:00:00+00		2026-03-19 09:50:58.247191+00	2026-03-19 09:50:58.247191+00
45	8	2026-03-19 10:00:00+00	2026-03-19 15:00:00+00		2026-03-19 09:51:23.606391+00	2026-03-19 09:51:23.606391+00
46	1	2026-03-19 11:00:00+00	2026-03-19 17:00:00+00		2026-03-19 09:51:34.125974+00	2026-03-19 09:51:34.125974+00
47	13	2026-03-19 09:30:00+00	2026-03-19 15:00:00+00		2026-03-19 09:52:53.077661+00	2026-03-19 09:52:53.077661+00
28	6	2026-03-18 10:20:00+00	2026-03-18 19:00:00+00		2026-03-18 10:21:37.859353+00	2026-03-19 10:11:38.766251+00
48	2	2026-03-19 09:00:00+00	2026-03-19 17:00:00+00		2026-03-19 15:50:36.493425+00	2026-03-19 15:50:36.493425+00
51	8	2026-03-20 08:00:00+00	2026-03-20 15:00:00+00		2026-03-20 08:09:47.181454+00	2026-03-20 08:09:47.181454+00
52	12	2026-03-20 09:00:00+00	2026-03-20 16:00:00+00		2026-03-20 08:09:56.008453+00	2026-03-20 08:09:56.008453+00
53	1	2026-03-20 11:00:00+00	2026-03-20 19:00:00+00		2026-03-20 08:10:05.09692+00	2026-03-20 08:10:05.09692+00
54	2	2026-03-20 10:30:00+00	2026-03-20 18:00:00+00		2026-03-20 08:10:39.929953+00	2026-03-20 08:10:39.929953+00
55	9	2026-03-20 08:00:00+00	2026-03-20 09:00:00+00		2026-03-20 08:27:38.288214+00	2026-03-20 08:27:38.288214+00
57	6	2026-03-20 10:30:00+00	2026-03-20 19:00:00+00		2026-03-20 10:54:43.543658+00	2026-03-20 10:54:43.543658+00
50	18	2026-03-20 07:30:00+00	2026-03-20 14:00:00+00		2026-03-20 08:09:38.34579+00	2026-03-20 14:15:16.211542+00
49	13	2026-03-20 07:30:00+00	2026-03-20 17:30:00+00		2026-03-20 08:09:11.345285+00	2026-03-20 14:15:32.983348+00
58	4	2026-03-20 15:00:00+00	2026-03-20 19:00:00+00		2026-03-20 15:11:55.288841+00	2026-03-20 15:11:55.288841+00
59	4	2026-03-21 08:00:00+00	2026-03-21 19:00:00+00		2026-03-21 08:57:25.372529+00	2026-03-21 08:57:25.372529+00
60	9	2026-03-21 09:00:00+00	2026-03-21 19:00:00+00		2026-03-21 09:36:53.981303+00	2026-03-21 09:36:53.981303+00
61	2	2026-03-21 06:00:00+00	2026-03-21 14:00:00+00		2026-03-21 16:03:33.288338+00	2026-03-21 16:03:33.288338+00
\.


--
-- Data for Name: staff; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.staff (id, role_id, first_name, last_name, phone, email, bio, base_salary, commission_rate, last_paid_at, total_revenue, is_active, created_at, updated_at, password_hash) FROM stdin;
11	1	Alina	Gregorchak	\N	\N	\N	0.00	0.4000	\N	0.00	t	2026-03-11 07:53:13.184836+00	2026-03-11 07:53:13.184836+00	\N
7	1	Viktoriia	N	\N	\N	\N	0.00	0.3000	2026-03-12	0.00	t	2026-03-10 15:57:10.751963+00	2026-03-12 18:31:51.222415+00	\N
2	1	Oleh	Safonkin	\N	\N	\N	0.00	0.5000	2026-03-21	0.00	t	2026-03-08 15:11:47.425673+00	2026-03-21 16:30:45.461024+00	\N
4	1	Denis	Chechin	\N	\N	\N	0.00	0.4000	2026-03-17	40000.00	t	2026-03-08 15:12:44.842397+00	2026-03-21 17:09:48.537972+00	\N
3	1	Ekaterina	Novinenko	\N	\N	\N	0.00	0.4000	2026-03-15	14000.00	t	2026-03-08 15:12:20.020301+00	2026-03-19 14:07:59.465266+00	\N
13	2	Maryna	K	\N	\N	\N	200.00	0.0000	2026-03-16	0.00	t	2026-03-11 07:55:06.960477+00	2026-03-16 09:38:54.253499+00	\N
14	3	Yaroslav	H	\N	\N	\N	300.00	0.0000	2026-03-14	0.00	t	2026-03-11 07:55:31.970184+00	2026-03-14 11:55:26.982352+00	\N
18	2	Lilia	A	\N	\N	\N	200.00	0.0000	\N	0.00	t	2026-03-20 08:08:12.34117+00	2026-03-20 08:08:12.34117+00	\N
8	1	Khrystyna	Chechina	\N	\N	\N	0.00	0.4000	2026-03-16	75900.00	t	2026-03-11 07:51:37.917996+00	2026-03-20 13:09:10.865576+00	\N
12	1	Ivan	Todorov	\N	\N	\N	0.00	0.4000	2026-03-20	0.00	t	2026-03-11 07:53:23.732446+00	2026-03-20 16:23:01.225237+00	\N
10	1	Samuel	Pasminka	\N	\N	\N	0.00	0.4000	2026-03-15	0.00	t	2026-03-11 07:53:00.366398+00	2026-03-15 14:31:31.298873+00	\N
17	2	Irina	Efimova	\N	\N	\N	200.00	0.0000	\N	0.00	t	2026-03-18 10:21:16.648847+00	2026-03-18 10:21:16.648847+00	\N
16	2	Natalia	Koval	\N	\N	\N	300.00	0.0000	2026-03-15	0.00	t	2026-03-15 15:08:51.724573+00	2026-03-15 15:10:35.200347+00	\N
15	3	Daria	P	\N	\N	\N	500.00	0.0000	2026-03-15	0.00	t	2026-03-11 07:56:27.47908+00	2026-03-15 15:12:40.023053+00	\N
5	3	Pasha	Kosov	\N	\N	\N	200.00	0.0000	2026-03-15	0.00	t	2026-03-08 15:26:40.382639+00	2026-03-15 15:33:02.033279+00	\N
1	1	Ilja	Potapeiko	\N	\N	\N	0.00	0.3000	2026-03-16	112500.00	t	2026-03-08 13:00:39.89444+00	2026-03-20 18:09:50.121278+00	\N
6	2	Masha	.	\N	\N	\N	200.00	0.0000	2026-03-18	0.00	t	2026-03-08 16:29:17.822499+00	2026-03-18 14:50:48.566407+00	\N
9	1	Volodymyr	Kochubei	\N	\N	\N	0.00	0.3000	2026-03-21	0.00	t	2026-03-11 07:52:32.600714+00	2026-03-21 10:29:32.196252+00	\N
\.


--
-- Data for Name: staff_documents; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.staff_documents (id, staff_id, document_type, period_from, period_to, signed_at, signer_name, signature_hash, signature_token, file_path, created_at) FROM stdin;
1	5	salary_report	2026-03-01	2026-03-14	2026-03-14 10:41:00.606+00	Pasha Kosov	d50a8f1f911dab7660f3e78685e6ebf96c78a44585486d3329e844449e0791af	e3dd9ca23441b1d5d2afda9a0cab81508d296416410634de25f4a9d84588f4ba	/app/backend/documents/salary_reports/staff_5/Pasha Kosov Salary Report 2026-03-14.pdf	2026-03-14 10:41:01.055586+00
2	5	salary_report	2026-02-28	2026-03-14	2026-03-14 11:09:48.47+00	Pasha Kosov	afe4580a7cd6f78e313ff7ad27e7699edbfda76a5396dfa20dccb9c61152eaa9	5f5ddb57fe4cfabd8a4e325be4b0cedb692150cd16da0e0525aca63e51beea86	/app/backend/documents/salary_reports/staff_5/Pasha Kosov Salary Report 2026-03-14.pdf	2026-03-14 11:09:49.15847+00
3	14	salary_report	2026-02-28	2026-03-14	2026-03-14 11:55:24.473+00	Yaroslav H	4c1240760ddb162c177465fc58e834010aef15a95f2e5756a4ae19ff88301add	f6380ab8bf2e8cfbb9fcf5eb91f944dbcb9cd2f6a16ec23146a8df4c42172c82	/app/backend/documents/salary_reports/staff_14/Yaroslav H Salary Report 2026-03-14.pdf	2026-03-14 11:55:27.242349+00
4	5	salary_report	2026-02-28	2026-03-14	2026-03-14 14:14:25.593+00	Pasha Kosov	4de4306ddff1e3f8afd777fbd6e7e91d8eb87596ce26238aaeb8923508a8c51e	2d2e39a0ee56ad80c9e72668142a54d848e0a8042a193e0489b78f22f11aeb3c	/app/backend/documents/salary_reports/staff_5/Pasha Kosov Salary Report 2026-03-14.pdf	2026-03-14 14:14:26.405248+00
5	2	salary_report	2026-02-28	2026-03-14	2026-03-14 16:17:16.886+00	Oleh Safonkin	cf5a1634f56d16c578eac20e950e7c8b8039a33c84be40d28447e1c1e833f4fa	15fa90a96146224eeefa96bbe0ce8434e96946f26e1ddca9f57aedad81c86665	/app/backend/documents/salary_reports/staff_2/Oleh Safonkin Salary Report 2026-03-14.pdf	2026-03-14 16:17:17.453855+00
6	10	salary_report	2026-02-28	2026-03-15	2026-03-15 14:31:30.984+00	Samuel Pasminka	db70892a9618f6a21d90b76284ec4b098a5ddfd4d447eb1d469f489d90ee1709	8b0b4b6d4939cb80bd9852b2d9cafecbce8cb63009eef92f07f2ae909d07f598	/app/backend/documents/salary_reports/staff_10/Samuel Pasminka Salary Report 2026-03-15.pdf	2026-03-15 14:31:31.441441+00
7	16	salary_report	2026-02-28	2026-03-15	2026-03-15 15:10:34.794+00	Natalia Koval	3c0af3440c07d17975cf0c1b39cb0140d7336276c160a305e5c34e2147decffb	379a33f5ac956459552a23e1e381464740443e31c679e92d7cc802b290848f72	/app/backend/documents/salary_reports/staff_16/Natalia Koval Salary Report 2026-03-15.pdf	2026-03-15 15:10:35.324338+00
8	15	salary_report	2026-02-28	2026-03-15	2026-03-15 15:12:39.822+00	Daria P	228841aeba3d9228232eab05f1d696ae8e1ad59c3d1f99a7e628c30452ca0f9f	f86b2b7d948fda64d46d33cf4fc5c9d3083b81d711646d8f3e024debd9ca8ff1	/app/backend/documents/salary_reports/staff_15/Daria P Salary Report 2026-03-15.pdf	2026-03-15 15:12:40.141234+00
9	5	salary_report	2026-02-28	2026-03-15	2026-03-15 15:33:01.509+00	Pasha Kosov	2f729b4f28e19440f03df160f8b091b98c2739b14b9f9c46dd212ccafa710553	fad773ffc79ea876825ad191da962303c7dd837d4d37d4fc8bae076ae784d36c	/app/backend/documents/salary_reports/staff_5/Pasha Kosov Salary Report 2026-03-15.pdf	2026-03-15 15:33:02.161252+00
10	9	salary_report	2026-02-28	2026-03-15	2026-03-15 16:15:03.081+00	Volodymyr Kochubei	ed2a09069648d9809dc72632df3fa9aeb1300ea078c7945f5e7f00faa3d9edb5	449c96c5c0fe1d57a98f9be7a66550af485df78193fcd09bd7c26847a2714412	/app/backend/documents/salary_reports/staff_9/Volodymyr Kochubei Salary Report 2026-03-15.pdf	2026-03-15 16:15:03.558729+00
11	3	salary_report	2026-02-28	2026-03-15	2026-03-15 16:16:32.575+00	Ekaterina Novinenko	70fc0a5b9d426f71a244d9e4ff76f81a577b0653f602e2b704ad4f0c1763bacc	9c5ab8600b83d78607f2a5c076297feed2cd2824c665aaf93688c5d9310e60f0	/app/backend/documents/salary_reports/staff_3/Ekaterina Novinenko Salary Report 2026-03-15.pdf	2026-03-15 16:16:33.020094+00
12	13	salary_report	2026-02-28	2026-03-16	2026-03-16 09:38:54.879+00	Maryna K	15069a8583e5d0b855064ce1873d4327c417db2f1a9a0246f6978cdcb3e93ef9	f926851a2b4afadf0619e5217b73a5cc29e89b5233113425963b9ee2b52c5040	/app/backend/documents/salary_reports/staff_13/Maryna K Salary Report 2026-03-16.pdf	2026-03-16 09:38:54.507624+00
13	1	salary_report	2026-02-28	2026-03-16	2026-03-16 11:13:26.294+00	Ilja Potapeiko	57f416ceb4e3689e398056362ea40f153a3da479f0f21e53854fd5426f180ebf	867d81560b27789b729eec67c27b5b4691bbe2f5c83d7b39ac21d64c4303037f	/app/backend/documents/salary_reports/staff_1/Ilja Potapeiko Salary Report 2026-03-16.pdf	2026-03-16 11:13:25.319102+00
14	2	salary_report	2026-02-28	2026-03-16	2026-03-16 16:01:38.102+00	Oleh Safonkin	a090dde5c0f841ba2a3d83dd92b0c32692a7f3c500999672f6971627a2519557	a39cc32f19ef2a2412b4b721fb30dd2eb590d9d7163c46329d703ef022a96f76	/app/backend/documents/salary_reports/staff_2/Oleh Safonkin Salary Report 2026-03-16.pdf	2026-03-16 16:01:38.542062+00
15	6	salary_report	2026-02-28	2026-03-16	2026-03-16 16:18:12.871+00	Masha .	5efa839414414424b88f913cd316a70587d818717acbf2e3d28753dccfb0eaeb	51b4cb7e03ebff219eef3d605b13d11dd0c5ce04fe5d91569eb0b1560d2bc5b1	/app/backend/documents/salary_reports/staff_6/Masha . Salary Report 2026-03-16.pdf	2026-03-16 16:18:13.188892+00
16	4	salary_report	2026-02-28	2026-03-17	2026-03-17 15:31:17.969+00	Denis Chechin	75e750551c98ff5c4adaf58cb8f7782d7e41e5959e8b78060f02bdc9590b562d	7510418baae8558a588a3436f9353408c1bb6a500aa60aa407acf58a1599b818	/app/backend/documents/salary_reports/staff_4/Denis Chechin Salary Report 2026-03-17.pdf	2026-03-17 15:31:16.790898+00
17	6	salary_report	2026-02-28	2026-03-18	2026-03-18 14:50:50.098+00	Masha .	d42fbdbb1860084d85261db22f6f0c56b07e09d9f5c5e0987a7561138ad492cb	ea07b511a84895dcf5c8e07d19c477d58b14ab83ea5e0e6cbdfbc86f6a6f2031	/app/backend/documents/salary_reports/staff_6/Masha . Salary Report 2026-03-18.pdf	2026-03-18 14:50:48.641369+00
18	2	salary_report	2026-02-28	2026-03-19	2026-03-19 16:10:37.879+00	Oleh Safonkin	081900eacdce800ff004cc5f0d35b11796b9e92d632da2585a09e633de86a48d	b24cab091bcf8bdfd18ee3a91d883422456daace8fbfa13c5dc42845dae607d0	/app/backend/documents/salary_reports/staff_2/Oleh Safonkin Salary Report 2026-03-19.pdf	2026-03-19 16:10:38.331977+00
19	12	salary_report	2026-02-28	2026-03-20	2026-03-20 16:23:00.884+00	Ivan Todorov	8f4ad759272d38082f82fbcac03696baeaacb1f0ace492df8e45bb7142ed1f0e	c49a5fb91d91e225b6b2793e2d9ef2a8ef2e23236d97efd264eb8f60289a52de	/app/backend/documents/salary_reports/staff_12/Ivan Todorov Salary Report 2026-03-20.pdf	2026-03-20 16:23:01.449899+00
20	2	salary_report	2026-02-28	2026-03-20	2026-03-20 17:37:16.525+00	Oleh Safonkin	f7beede1a7c081e4b3e75ac67dbb5e6bd4ab2c71c483342e598431bc4ccb28ae	b7a4526ec4f8183f0825ed70b8a4654a5d62a6a14e6d5e50628dd6206db3c176	/app/backend/documents/salary_reports/staff_2/Oleh Safonkin Salary Report 2026-03-20.pdf	2026-03-20 17:37:16.982789+00
21	9	salary_report	2026-02-28	2026-03-21	2026-03-21 10:29:31.883+00	Volodymyr Kochubei	e7b45887a04bba53b7ae07b55b94099d37aa5afe21d0d9152c990696f8d53904	ba9de01a9ba2dab80bc219e1163bb355bb419d56350c2fbea1e6ad1e4b8868de	/app/backend/documents/salary_reports/staff_9/Volodymyr Kochubei Salary Report 2026-03-21.pdf	2026-03-21 10:29:32.320986+00
22	2	salary_report	2026-02-28	2026-03-21	2026-03-21 16:30:45.147+00	Oleh Safonkin	62e97d7b0577793455076bb45b55d0c0cb9ccdf13cd1fa7408a3842723ceec21	efb4f6b4b9383f69c112ff2248af2d1181f23e0be9e89a89815ea5f9a18c4855	/app/backend/documents/salary_reports/staff_2/Oleh Safonkin Salary Report 2026-03-21.pdf	2026-03-21 16:30:45.582374+00
\.


--
-- Data for Name: staff_roles; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.staff_roles (id, name) FROM stdin;
1	doctor
2	assistant
3	administrator
4	janitor
\.


--
-- Data for Name: staff_timesheets; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.staff_timesheets (id, staff_id, work_date, start_time, end_time, hours, note) FROM stdin;
18	15	2026-03-18	11:30:00	16:00:00	4.50	\N
19	15	2026-03-19	09:30:00	16:00:00	6.50	\N
20	15	2026-03-17	10:00:00	16:00:00	6.00	\N
21	15	2026-03-16	09:00:00	16:00:00	7.00	\N
22	15	2026-03-13	09:00:00	16:00:00	7.00	\N
23	15	2026-03-12	09:00:00	16:00:00	7.00	\N
24	15	2026-03-11	09:00:00	16:00:00	7.00	\N
25	15	2026-03-10	11:30:00	16:00:00	4.50	\N
26	15	2026-03-09	10:30:00	17:30:00	7.00	\N
27	15	2026-03-07	16:00:00	20:00:00	4.00	\N
28	15	2026-03-06	10:00:00	12:00:00	2.00	\N
29	15	2026-03-05	09:00:00	16:00:00	7.00	\N
30	15	2026-03-04	09:00:00	16:00:00	7.00	\N
31	15	2026-03-03	09:30:00	16:00:00	6.50	\N
32	15	2026-03-02	09:00:00	16:00:00	7.00	\N
33	13	2026-03-19	10:30:00	16:00:00	5.50	\N
34	13	2026-03-17	11:20:00	20:00:00	8.67	\N
35	13	2026-03-16	09:00:00	16:30:00	7.50	\N
36	6	2026-03-16	11:30:00	19:30:00	8.00	\N
37	6	2026-03-17	09:30:00	19:00:00	9.50	\N
38	6	2026-03-18	11:30:00	20:00:00	8.50	\N
39	6	2026-03-19	12:00:00	18:30:00	6.50	\N
40	17	2026-03-18	11:30:00	16:00:00	4.50	\N
41	17	2026-03-03	09:30:00	17:00:00	7.50	\N
42	17	2026-03-05	08:30:00	11:00:00	2.50	\N
43	17	2026-03-06	09:30:00	15:30:00	6.00	\N
44	5	2026-03-19	16:00:00	18:30:00	2.50	\N
45	18	2026-03-04	08:30:00	11:00:00	2.50	\N
46	15	2026-03-20	09:00:00	16:00:00	7.00	\N
47	13	2026-03-20	08:30:00	19:00:00	10.50	\N
48	5	2026-03-20	16:00:00	19:30:00	3.50	\N
49	5	2026-03-21	09:00:00	18:30:00	9.50	\N
50	13	2026-03-21	08:30:00	18:30:00	10.00	\N
\.


--
-- Data for Name: timesheets_audit; Type: TABLE DATA; Schema: public; Owner: policlinic
--

COPY public.timesheets_audit (id, timesheet_id, staff_id, action, old_data, new_data, changed_by_id, created_at) FROM stdin;
1	1	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 16:20:55.041561+00
2	2	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 16:21:11.508275+00
3	3	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-03-08", "start_time": "16:00"}	5	2026-03-08 16:21:35.988144+00
4	4	5	create	\N	{"end_time": "20:00", "staff_id": 5, "work_date": "2026-03-06", "start_time": "16:00"}	5	2026-03-08 16:24:51.466014+00
5	5	6	create	\N	{"end_time": "18:30", "staff_id": 6, "work_date": "2026-03-08", "start_time": "08:10"}	6	2026-03-08 16:29:39.205563+00
6	3	5	update	{"note": "", "hours": 2.0, "end_time": "18:00:00", "work_date": "2026-03-08", "start_time": "16:00:00"}	{"end_time": "18:00", "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 17:46:24.967583+00
7	6	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 17:46:42.203321+00
8	7	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-02-26", "start_time": "16:00"}	5	2026-03-08 17:47:11.453038+00
9	8	5	create	\N	{"end_time": "19:00", "staff_id": 5, "work_date": "2026-03-08", "start_time": "09:00"}	5	2026-03-08 17:47:24.742488+00
10	9	5	create	\N	{"end_time": "17:00", "staff_id": 5, "work_date": "2026-03-07", "start_time": "11:00"}	5	2026-03-08 17:48:05.94699+00
11	10	5	create	\N	{"end_time": "18:00", "staff_id": 5, "work_date": "2026-03-08", "start_time": "16:00"}	5	2026-03-08 17:48:25.734464+00
12	10	5	update	{"note": "", "hours": 2.0, "end_time": "18:00:00", "work_date": "2026-03-08", "start_time": "16:00:00"}	{"note": "за 26.02", "end_time": "18:00", "work_date": "2026-03-08", "start_time": "16:00"}	5	2026-03-08 17:48:46.947058+00
13	10	5	update	{"note": "за 26.02", "hours": 2.0, "end_time": "18:00:00", "work_date": "2026-03-08", "start_time": "16:00:00"}	{"note": "за 26.02", "end_time": "18:00", "work_date": "2026-03-08", "start_time": "16:00"}	5	2026-03-08 17:48:51.083747+00
14	4	5	update	{"note": "", "hours": 4.0, "end_time": "20:00:00", "work_date": "2026-03-06", "start_time": "16:00:00"}	{"end_time": "20:00", "work_date": "2026-03-05", "start_time": "16:00"}	5	2026-03-08 17:49:27.177934+00
15	11	13	create	\N	{"end_time": "20:00", "staff_id": 13, "work_date": "2026-03-14", "start_time": "10:00"}	13	2026-03-14 11:58:57.201722+00
16	12	5	create	\N	{"end_time": "19:00", "staff_id": 5, "work_date": "2026-03-12", "start_time": "16:00"}	5	2026-03-14 18:16:50.915056+00
17	13	5	create	\N	{"end_time": "19:00", "staff_id": 5, "work_date": "2026-03-13", "start_time": "16:00"}	5	2026-03-14 18:17:46.865327+00
18	14	5	create	\N	{"end_time": "20:00", "staff_id": 5, "work_date": "2026-03-14", "start_time": "09:00"}	5	2026-03-15 13:08:59.458682+00
19	15	5	create	\N	{"end_time": "20:00", "staff_id": 5, "work_date": "2026-03-15", "start_time": "09:00"}	5	2026-03-15 13:09:23.822603+00
20	16	16	create	\N	{"end_time": "20:00", "staff_id": 16, "work_date": "2026-03-14", "start_time": "08:30"}	16	2026-03-15 15:09:18.098255+00
21	17	16	create	\N	{"end_time": "16:00", "staff_id": 16, "work_date": "2026-03-15", "start_time": "09:00"}	16	2026-03-15 15:09:32.260564+00
22	18	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-18", "start_time": "11:30"}	15	2026-03-18 14:52:42.036206+00
23	19	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-19", "start_time": "09:30"}	15	2026-03-19 08:42:38.594996+00
24	20	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-17", "start_time": "10:00"}	15	2026-03-19 08:43:09.925558+00
25	21	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-16", "start_time": "09:00"}	15	2026-03-19 08:43:26.977889+00
26	22	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-13", "start_time": "09:00"}	15	2026-03-19 08:43:46.084182+00
27	23	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-12", "start_time": "09:00"}	15	2026-03-19 08:43:56.688949+00
28	24	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-11", "start_time": "09:00"}	15	2026-03-19 08:44:08.981115+00
29	25	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-10", "start_time": "11:30"}	15	2026-03-19 08:44:24.400832+00
30	26	15	create	\N	{"end_time": "17:30", "staff_id": 15, "work_date": "2026-03-09", "start_time": "10:30"}	15	2026-03-19 08:44:44.597493+00
31	27	15	create	\N	{"end_time": "20:00", "staff_id": 15, "work_date": "2026-03-07", "start_time": "16:00"}	15	2026-03-19 08:45:00.426587+00
32	28	15	create	\N	{"end_time": "12:00", "staff_id": 15, "work_date": "2026-03-06", "start_time": "10:00"}	15	2026-03-19 08:45:15.441768+00
33	29	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-05", "start_time": "09:00"}	15	2026-03-19 08:45:25.633041+00
34	30	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-04", "start_time": "09:00"}	15	2026-03-19 08:45:34.689049+00
35	31	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-03", "start_time": "09:30"}	15	2026-03-19 08:45:47.608954+00
36	32	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-02", "start_time": "09:00"}	15	2026-03-19 08:45:58.104058+00
37	33	13	create	\N	{"end_time": "16:00", "staff_id": 13, "work_date": "2026-03-19", "start_time": "10:30"}	13	2026-03-19 09:53:06.465123+00
38	34	13	create	\N	{"end_time": "20:00", "staff_id": 13, "work_date": "2026-03-17", "start_time": "11:20"}	13	2026-03-19 10:08:46.716845+00
39	35	13	create	\N	{"end_time": "16:30", "staff_id": 13, "work_date": "2026-03-16", "start_time": "09:00"}	13	2026-03-19 10:09:08.874756+00
40	36	6	create	\N	{"end_time": "19:30", "staff_id": 6, "work_date": "2026-03-16", "start_time": "11:30"}	6	2026-03-19 10:10:17.67149+00
41	37	6	create	\N	{"end_time": "19:00", "staff_id": 6, "work_date": "2026-03-17", "start_time": "09:30"}	6	2026-03-19 10:10:47.540548+00
42	38	6	create	\N	{"end_time": "20:00", "staff_id": 6, "work_date": "2026-03-18", "start_time": "11:30"}	6	2026-03-19 10:11:32.56836+00
43	39	6	create	\N	{"end_time": "18:30", "staff_id": 6, "work_date": "2026-03-19", "start_time": "12:00"}	6	2026-03-19 11:20:04.445568+00
44	40	17	create	\N	{"end_time": "16:00", "staff_id": 17, "work_date": "2026-03-18", "start_time": "11:30"}	17	2026-03-19 11:58:23.551567+00
45	41	17	create	\N	{"end_time": "17:00", "staff_id": 17, "work_date": "2026-03-03", "start_time": "09:30"}	17	2026-03-19 11:59:18.917027+00
46	42	17	create	\N	{"end_time": "11:00", "staff_id": 17, "work_date": "2026-03-05", "start_time": "08:30"}	17	2026-03-19 11:59:41.134635+00
47	43	17	create	\N	{"end_time": "15:30", "staff_id": 17, "work_date": "2026-03-06", "start_time": "09:30"}	17	2026-03-19 12:00:11.892316+00
48	44	5	create	\N	{"end_time": "19:00", "staff_id": 5, "work_date": "2026-03-19", "start_time": "16:00"}	5	2026-03-19 16:46:48.959589+00
49	44	5	update	{"note": "", "hours": 3.0, "end_time": "19:00:00", "work_date": "2026-03-19", "start_time": "16:00:00"}	{"end_time": "18:30", "work_date": "2026-03-19", "start_time": "16:00"}	5	2026-03-19 17:21:04.386032+00
50	45	18	create	\N	{"end_time": "11:00", "staff_id": 18, "work_date": "2026-03-04", "start_time": "08:30"}	18	2026-03-20 08:08:42.631684+00
51	46	15	create	\N	{"end_time": "16:00", "staff_id": 15, "work_date": "2026-03-20", "start_time": "09:00"}	15	2026-03-20 08:11:23.994535+00
52	47	13	create	\N	{"end_time": "19:00", "staff_id": 13, "work_date": "2026-03-20", "start_time": "08:30"}	13	2026-03-20 17:52:16.337714+00
53	48	5	create	\N	{"end_time": "19:30", "staff_id": 5, "work_date": "2026-03-20", "start_time": "16:00"}	5	2026-03-21 13:29:33.508445+00
54	49	5	create	\N	{"end_time": "18:30", "staff_id": 5, "work_date": "2026-03-21", "start_time": "09:00"}	5	2026-03-21 17:10:56.14401+00
55	50	13	create	\N	{"end_time": "18:30", "staff_id": 13, "work_date": "2026-03-21", "start_time": "08:30"}	13	2026-03-21 17:29:53.293476+00
\.


--
-- Name: clinic_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.clinic_settings_id_seq', 5, true);


--
-- Name: income_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.income_records_id_seq', 192, true);


--
-- Name: medicine_presets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.medicine_presets_id_seq', 7, true);


--
-- Name: outcome_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.outcome_categories_id_seq', 5, true);


--
-- Name: outcome_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.outcome_records_id_seq', 10, true);


--
-- Name: patients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.patients_id_seq', 155, true);


--
-- Name: salary_adjustments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.salary_adjustments_id_seq', 1, false);


--
-- Name: salary_amount_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.salary_amount_audit_id_seq', 21, true);


--
-- Name: salary_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.salary_payments_id_seq', 29, true);


--
-- Name: schedule_audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.schedule_audit_logs_id_seq', 70, true);


--
-- Name: shifts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.shifts_id_seq', 61, true);


--
-- Name: staff_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.staff_documents_id_seq', 22, true);


--
-- Name: staff_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.staff_id_seq', 18, true);


--
-- Name: staff_roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.staff_roles_id_seq', 7, true);


--
-- Name: staff_timesheets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.staff_timesheets_id_seq', 50, true);


--
-- Name: timesheets_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: policlinic
--

SELECT pg_catalog.setval('public.timesheets_audit_id_seq', 55, true);


--
-- Name: clinic_settings clinic_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.clinic_settings
    ADD CONSTRAINT clinic_settings_pkey PRIMARY KEY (id);


--
-- Name: clinic_settings clinic_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.clinic_settings
    ADD CONSTRAINT clinic_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: income_records income_records_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_pkey PRIMARY KEY (id);


--
-- Name: medicine_presets medicine_presets_name_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.medicine_presets
    ADD CONSTRAINT medicine_presets_name_key UNIQUE (name);


--
-- Name: medicine_presets medicine_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.medicine_presets
    ADD CONSTRAINT medicine_presets_pkey PRIMARY KEY (id);


--
-- Name: outcome_categories outcome_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_categories
    ADD CONSTRAINT outcome_categories_name_key UNIQUE (name);


--
-- Name: outcome_categories outcome_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_categories
    ADD CONSTRAINT outcome_categories_pkey PRIMARY KEY (id);


--
-- Name: outcome_records outcome_records_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_records
    ADD CONSTRAINT outcome_records_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: salary_adjustments salary_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_adjustments
    ADD CONSTRAINT salary_adjustments_pkey PRIMARY KEY (id);


--
-- Name: salary_amount_audit salary_amount_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_amount_audit
    ADD CONSTRAINT salary_amount_audit_pkey PRIMARY KEY (id);


--
-- Name: salary_payments salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_pkey PRIMARY KEY (id);


--
-- Name: schedule_audit_logs schedule_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.schedule_audit_logs
    ADD CONSTRAINT schedule_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: staff_documents staff_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_pkey PRIMARY KEY (id);


--
-- Name: staff staff_email_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_email_key UNIQUE (email);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff_roles staff_roles_name_key; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_roles
    ADD CONSTRAINT staff_roles_name_key UNIQUE (name);


--
-- Name: staff_roles staff_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_roles
    ADD CONSTRAINT staff_roles_pkey PRIMARY KEY (id);


--
-- Name: staff_timesheets staff_timesheets_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_timesheets
    ADD CONSTRAINT staff_timesheets_pkey PRIMARY KEY (id);


--
-- Name: timesheets_audit timesheets_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.timesheets_audit
    ADD CONSTRAINT timesheets_audit_pkey PRIMARY KEY (id);


--
-- Name: idx_income_doctor; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_income_doctor ON public.income_records USING btree (doctor_id);


--
-- Name: idx_income_salary_payment; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_income_salary_payment ON public.income_records USING btree (salary_payment_id);


--
-- Name: idx_income_service_date; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_income_service_date ON public.income_records USING btree (service_date);


--
-- Name: idx_outcome_expense_date; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_outcome_expense_date ON public.outcome_records USING btree (expense_date);


--
-- Name: idx_patients_last_first_name; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE UNIQUE INDEX idx_patients_last_first_name ON public.patients USING btree (last_name, first_name);


--
-- Name: idx_salary_adjustments_applied; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_salary_adjustments_applied ON public.salary_adjustments USING btree (applied_to_salary_payment_id);


--
-- Name: idx_salary_adjustments_staff; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_salary_adjustments_staff ON public.salary_adjustments USING btree (staff_id);


--
-- Name: idx_salary_amount_audit_created; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_salary_amount_audit_created ON public.salary_amount_audit USING btree (created_at DESC);


--
-- Name: idx_salary_amount_audit_payment; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_salary_amount_audit_payment ON public.salary_amount_audit USING btree (salary_payment_id);


--
-- Name: idx_salary_amount_audit_staff; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_salary_amount_audit_staff ON public.salary_amount_audit USING btree (staff_id);


--
-- Name: idx_salary_payment_date; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_salary_payment_date ON public.salary_payments USING btree (payment_date);


--
-- Name: idx_schedule_audit_logs_shift; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_schedule_audit_logs_shift ON public.schedule_audit_logs USING btree (shift_id);


--
-- Name: idx_shifts_staff; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_shifts_staff ON public.shifts USING btree (staff_id);


--
-- Name: idx_shifts_time; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_shifts_time ON public.shifts USING btree (start_time, end_time);


--
-- Name: idx_staff_documents_period; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_staff_documents_period ON public.staff_documents USING btree (period_from, period_to);


--
-- Name: idx_staff_documents_signed_at; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_staff_documents_signed_at ON public.staff_documents USING btree (signed_at);


--
-- Name: idx_staff_documents_staff; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_staff_documents_staff ON public.staff_documents USING btree (staff_id);


--
-- Name: idx_staff_documents_type; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_staff_documents_type ON public.staff_documents USING btree (document_type);


--
-- Name: idx_staff_role; Type: INDEX; Schema: public; Owner: policlinic
--

CREATE INDEX idx_staff_role ON public.staff USING btree (role_id);


--
-- Name: income_records trg_income_after_insert; Type: TRIGGER; Schema: public; Owner: policlinic
--

CREATE TRIGGER trg_income_after_insert AFTER INSERT ON public.income_records FOR EACH ROW EXECUTE FUNCTION public.update_doctor_total_revenue();


--
-- Name: salary_payments trg_salary_payment_after_insert; Type: TRIGGER; Schema: public; Owner: policlinic
--

CREATE TRIGGER trg_salary_payment_after_insert AFTER INSERT ON public.salary_payments FOR EACH ROW EXECUTE FUNCTION public.update_last_paid_at();


--
-- Name: income_records income_records_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.staff(id);


--
-- Name: income_records income_records_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: income_records income_records_salary_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.income_records
    ADD CONSTRAINT income_records_salary_payment_id_fkey FOREIGN KEY (salary_payment_id) REFERENCES public.salary_payments(id) ON DELETE SET NULL;


--
-- Name: outcome_records outcome_records_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.outcome_records
    ADD CONSTRAINT outcome_records_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.outcome_categories(id);


--
-- Name: salary_adjustments salary_adjustments_applied_to_salary_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_adjustments
    ADD CONSTRAINT salary_adjustments_applied_to_salary_payment_id_fkey FOREIGN KEY (applied_to_salary_payment_id) REFERENCES public.salary_payments(id) ON DELETE SET NULL;


--
-- Name: salary_adjustments salary_adjustments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_adjustments
    ADD CONSTRAINT salary_adjustments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: salary_amount_audit salary_amount_audit_salary_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_amount_audit
    ADD CONSTRAINT salary_amount_audit_salary_payment_id_fkey FOREIGN KEY (salary_payment_id) REFERENCES public.salary_payments(id) ON DELETE SET NULL;


--
-- Name: salary_amount_audit salary_amount_audit_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_amount_audit
    ADD CONSTRAINT salary_amount_audit_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: salary_payments salary_payments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: schedule_audit_logs schedule_audit_logs_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.schedule_audit_logs
    ADD CONSTRAINT schedule_audit_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.staff(id);


--
-- Name: shifts shifts_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_documents staff_documents_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff staff_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.staff_roles(id);


--
-- Name: staff_timesheets staff_timesheets_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.staff_timesheets
    ADD CONSTRAINT staff_timesheets_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: timesheets_audit timesheets_audit_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.timesheets_audit
    ADD CONSTRAINT timesheets_audit_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES public.staff(id);


--
-- Name: timesheets_audit timesheets_audit_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policlinic
--

ALTER TABLE ONLY public.timesheets_audit
    ADD CONSTRAINT timesheets_audit_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- PostgreSQL database dump complete
--

\unrestrict WGWVnDuLiAhBH7kPL1xHqM5RQ1k8cFLBzbGXCo5Pdp4wYvjrNtcxTC3Y4XsaPBt

