-- VITALYX PostgreSQL foundation.
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/001_initial_schema.sql
-- This schema does not create database credentials or connect the browser directly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('pending', 'active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('patient', 'admin', 'doctor', 'emergency');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE grant_status AS ENUM ('pending', 'active', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'in_review', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE emergency_status AS ENUM ('pending', 'acknowledged', 'assigned', 'dispatched', 'resolved', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  phone text,
  password_hash text NOT NULL,
  status account_status NOT NULL DEFAULT 'pending',
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS roles (
  code app_role PRIMARY KEY,
  description text NOT NULL
);
INSERT INTO roles (code, description) VALUES
  ('patient', 'Patient account'), ('admin', 'Family administrator'),
  ('doctor', 'Healthcare professional'), ('emergency', 'Emergency operations staff')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role app_role NOT NULL REFERENCES roles(code),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  date_of_birth date,
  gender text,
  address text,
  profession text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  external_ref text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);

-- Explicit patient-level authorization; never infer access from role alone.
CREATE TABLE IF NOT EXISTS patient_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  grantee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship text NOT NULL,
  permissions text[] NOT NULL DEFAULT ARRAY['read']::text[],
  status grant_status NOT NULL DEFAULT 'pending',
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  UNIQUE (patient_id, grantee_user_id)
);
CREATE INDEX IF NOT EXISTS patient_grants_user_status_idx ON patient_access_grants(grantee_user_id, status);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  starts_at timestamptz,
  appointment_type text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_patient_time_idx ON appointments(patient_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  device_type text NOT NULL,
  manufacturer text,
  external_device_id text,
  status text NOT NULL DEFAULT 'active',
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  UNIQUE (manufacturer, external_device_id)
);

-- Future live tracking: append-only, timestamped observations.
CREATE TABLE IF NOT EXISTS observations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  code text NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL,
  measured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  quality text NOT NULL DEFAULT 'unknown',
  source text NOT NULL DEFAULT 'manual',
  PRIMARY KEY (id, measured_at)
);
CREATE INDEX IF NOT EXISTS observations_patient_metric_time_idx ON observations(patient_id, code, measured_at DESC);
CREATE INDEX IF NOT EXISTS observations_received_at_idx ON observations(received_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity text NOT NULL,
  status alert_status NOT NULL DEFAULT 'open',
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS alerts_patient_status_time_idx ON alerts(patient_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS emergency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  concern text NOT NULL,
  risk_state text,
  location jsonb,
  status emergency_status NOT NULL DEFAULT 'pending',
  assigned_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS emergency_queue_idx ON emergency_requests(status, requested_at);

-- Workflow and ML provenance. Store references/metadata here, not secrets or raw documents.
CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name text NOT NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  trigger_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  input_ref text,
  output_ref text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_name, version)
);
CREATE TABLE IF NOT EXISTS model_inferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid NOT NULL REFERENCES model_versions(id),
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL,
  input_ref text,
  result jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'unreviewed',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_patient_time_idx ON audit_events(patient_id, created_at DESC);
