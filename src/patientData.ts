import { supabase } from './supabase'

export type Observation = {
  id: string
  code: string
  value: number
  unit: string
  measured_at: string
  quality: string
  source: string
}

export type PatientAlert = {
  id: string
  type: string
  severity: string
  status: string
  summary: string
  created_at: string
}

export type PatientAppointment = {
  id: string
  starts_at: string
  appointment_type: string
  status: string
  notes: string | null
}

export type PatientDashboardData = {
  patientId: string | null
  openAlertsCount: number
  upcomingAppointmentCount: number
  observations: Observation[]
  alerts: PatientAlert[]
  appointments: PatientAppointment[]
}

export async function loadPatientDashboardData(userId: string): Promise<PatientDashboardData> {
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (patientError) throw new Error(`Could not load your patient profile: ${patientError.message}`)
  if (!patient) return { patientId: null, openAlertsCount: 0, upcomingAppointmentCount: 0, observations: [], alerts: [], appointments: [] }

  const [observationsResult, alertsResult, appointmentsResult] = await Promise.all([
    supabase
      .from('observations')
      .select('id, code, value, unit, measured_at, quality, source')
      .eq('patient_id', patient.id)
      .order('measured_at', { ascending: false })
      .limit(100),
    supabase
      .from('alerts')
      .select('id, type, severity, status, summary, created_at', { count: 'exact' })
      .eq('patient_id', patient.id)
      .neq('status', 'resolved')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('appointments')
      .select('id, starts_at, appointment_type, status, notes', { count: 'exact' })
      .eq('patient_id', patient.id)
      .not('starts_at', 'is', null)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(10),
  ])

  if (observationsResult.error) throw new Error(`Could not load your health readings: ${observationsResult.error.message}`)
  if (alertsResult.error) throw new Error(`Could not load your alerts: ${alertsResult.error.message}`)
  if (appointmentsResult.error) throw new Error(`Could not load your appointments: ${appointmentsResult.error.message}`)

  return {
    patientId: patient.id,
    openAlertsCount: alertsResult.count ?? alertsResult.data?.length ?? 0,
    upcomingAppointmentCount: appointmentsResult.count ?? appointmentsResult.data?.length ?? 0,
    observations: observationsResult.data ?? [],
    alerts: alertsResult.data ?? [],
    appointments: appointmentsResult.data ?? [],
  }
}
