-- Link VITALYX account records to Supabase Auth; passwords belong only to auth.users.
-- Safe for this project’s empty prototype users table. Run after 001_initial_schema.sql.

ALTER TABLE public.users
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS password_hash;

DROP INDEX IF EXISTS public.users_phone_uq;
CREATE INDEX IF NOT EXISTS users_phone_idx ON public.users (phone) WHERE phone IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT users_auth_user_fk
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create a patient role/profile automatically for public self-registration.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  safe_name text;
BEGIN
  safe_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  INSERT INTO public.users (id, email, phone, status, email_verified_at)
  VALUES (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    'active',
    new.email_confirmed_at
  )
  ON CONFLICT (id) DO UPDATE
    SET email = excluded.email,
        phone = excluded.phone,
        email_verified_at = excluded.email_verified_at;

  INSERT INTO public.profiles (user_id, full_name, date_of_birth, address, profession)
  VALUES (
    new.id,
    safe_name,
    nullif(trim(new.raw_user_meta_data ->> 'date_of_birth'), '')::date,
    nullif(trim(new.raw_user_meta_data ->> 'address'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'profession'), '')
  )
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = excluded.full_name,
        date_of_birth = excluded.date_of_birth,
        address = excluded.address,
        profession = excluded.profession;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'patient')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- RLS must be enabled explicitly; clinical tables remain closed until patient-grant policies exist.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_inferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Minimal self-access policies. Clinical data remains closed until patient grant policies exist.
DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self ON public.users
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS user_roles_select_self ON public.user_roles;
CREATE POLICY user_roles_select_self ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS roles_select_authenticated ON public.roles;
CREATE POLICY roles_select_authenticated ON public.roles
  FOR SELECT TO authenticated USING (true);
