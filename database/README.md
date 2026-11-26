# Supabase and PostgreSQL setup

The migrations create VITALYX account and clinical-workflow tables, link VITALYX accounts to Supabase Auth, and provision a patient role/profile during public sign-up. The browser uses Supabase Auth and the public anon/publishable key; never put a service-role key or database connection string in Vite environment variables.

## Apply the migrations

Run these scripts in order in the Supabase SQL Editor or with a privileged database connection:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/001_initial_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/002_supabase_auth.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/003_patient_dashboard_rls.sql
```

On PowerShell, use `$env:DATABASE_URL` as the environment variable reference. The migrations are designed to be rerun in order.

The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.local`. Keep that file out of source control. The anon/publishable key is public by design; row-level security is the boundary that protects database data.

RLS is enabled for account, profile, role, and clinical tables by the auth migration. Migration 003 provisions patient rows for patient-role accounts and adds read-only policies for the patient's own rows and rows covered by an active, unexpired `read` grant. The browser dashboard reads patient profiles, observations, alerts, and upcoming appointments; it does not write clinical data. Patient access grants and other clinical workflow tables remain closed to browser clients. Do not disable RLS to make the app work.

`observations` is ready for future data capture. Measure ingestion/query volume before adding partitions or a dedicated time-series service. Restrict `location` and model-result JSON to only the data the feature needs, and define retention rules.

Routines, medications, records, staff workflows, and other unsupported screens still contain demo content or use browser `localStorage`; they are not connected to PostgreSQL. Do not treat the prototype as production-ready. Before using real patient data, validate RLS with separate patient accounts, complete authorized staff provisioning, operational monitoring, backups, encryption, and retention controls.
