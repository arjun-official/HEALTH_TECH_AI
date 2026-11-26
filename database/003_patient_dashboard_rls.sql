-- Patient self-access and read-only access for explicitly granted care-team members.
-- Run after 001_initial_schema.sql and 002_supabase_auth.sql.

CREATE OR REPLACE FUNCTION public.create_patient_for_patient_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.role = 'patient' THEN
    INSERT INTO public.patients (user_id)
    VALUES (new.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_patient_role_created ON public.user_roles;
CREATE TRIGGER on_patient_role_created
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.create_patient_for_patient_role();

-- Provision patient rows for patient accounts created before this migration.
INSERT INTO public.patients (user_id)
SELECT user_id
FROM public.user_roles
WHERE role = 'patient'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_read_patient(target_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients AS patient
    WHERE patient.id = target_patient_id
      AND patient.user_id = (SELECT auth.uid())
      AND patient.deactivated_at IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.patient_access_grants AS access_grant
    WHERE access_grant.patient_id = target_patient_id
      AND access_grant.grantee_user_id = (SELECT auth.uid())
      AND access_grant.status = 'active'
      AND access_grant.starts_at <= now()
      AND (access_grant.expires_at IS NULL OR access_grant.expires_at > now())
      AND 'read' = ANY(access_grant.permissions)
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_patient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_patient(uuid) TO authenticated;

DROP POLICY IF EXISTS patients_select_self_or_granted ON public.patients;
CREATE POLICY patients_select_self_or_granted ON public.patients
  FOR SELECT TO authenticated
  USING (public.can_read_patient(id));

DROP POLICY IF EXISTS appointments_select_self_or_granted ON public.appointments;
CREATE POLICY appointments_select_self_or_granted ON public.appointments
  FOR SELECT TO authenticated
  USING (public.can_read_patient(patient_id));

DROP POLICY IF EXISTS devices_select_self_or_granted ON public.devices;
CREATE POLICY devices_select_self_or_granted ON public.devices
  FOR SELECT TO authenticated
  USING (public.can_read_patient(patient_id));

DROP POLICY IF EXISTS observations_select_self_or_granted ON public.observations;
CREATE POLICY observations_select_self_or_granted ON public.observations
  FOR SELECT TO authenticated
  USING (public.can_read_patient(patient_id));

DROP POLICY IF EXISTS alerts_select_self_or_granted ON public.alerts;
CREATE POLICY alerts_select_self_or_granted ON public.alerts
  FOR SELECT TO authenticated
  USING (public.can_read_patient(patient_id));

DROP POLICY IF EXISTS emergency_requests_select_self_or_granted ON public.emergency_requests;
CREATE POLICY emergency_requests_select_self_or_granted ON public.emergency_requests
  FOR SELECT TO authenticated
  USING (public.can_read_patient(patient_id));

CREATE INDEX IF NOT EXISTS observations_patient_measured_at_idx
  ON public.observations (patient_id, measured_at DESC);
