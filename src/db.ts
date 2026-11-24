export type StoredState = {
  routineDone: boolean[]
  alerts: string[]
  appointments: { time: string; person: string; type: string; status: string }[]
  accounts: Account[]
  adminProfiles: AdminProfile[]
  patients: PatientRecord[]
  notifications: NotificationRecord[]
}

export type Account = { email: string; password: string; phone?: string; role: 'patient' | 'admin' | 'doctor' | 'emergency'; name: string; title: string; dateOfBirth?: string; profession?: string; address?: string; access?: 'active' | 'pending'; onboardingComplete?: boolean }
export type AdminProfile = { adminEmail: string; phone: string; dateOfBirth: string; address: string; organisation?: string }
export type PatientRecord = { id: string; adminEmail: string; name: string; location: string; dateOfBirth: string; age: number; conditions: string; prescriptionFile?: string; labReportFile?: string; extractedSummary?: string; createdAt: string }
export type NotificationRecord = { id: string; recipientEmail: string; subject: string; body: string; createdAt: string; type: 'appointment-confirmation' | 'info' }

const databaseKey = 'vitalyx-demo-database'

const seedState: StoredState = {
  routineDone: [true, true, false, false, false],
  alerts: ['Low activity detected in the last 2 hours'],
  appointments: [
    { time: '09:30', person: 'Eleanor Wright', type: 'Follow-up consultation', status: 'Confirmed' },
    { time: '11:00', person: 'Alex Morgan', type: 'Recovery review', status: 'Awaiting check-in' },
    { time: '14:15', person: 'Samuel Ortiz', type: 'Routine review', status: 'Confirmed' },
  ],
  accounts: [
    { email: 'alex@demo.com', password: 'demo123', role: 'patient', name: 'Alex Morgan', title: 'Patient account', access: 'active' },
    { email: 'maya@demo.com', password: 'demo123', role: 'admin', name: 'Maya Patel', title: 'Family administrator', access: 'active' },
    { email: 'jordan@demo.com', password: 'demo123', role: 'doctor', name: 'Dr. Jordan Lee', title: 'Cardiology', access: 'active' },
    { email: 'dispatch@demo.com', password: 'demo123', role: 'emergency', name: 'Central Dispatch', title: 'Emergency operations', access: 'active' },
  ],
  adminProfiles: [],
  patients: [],
  notifications: [],
}

function cloneSeed(): StoredState {
  return { ...seedState, routineDone: [...seedState.routineDone], alerts: [...seedState.alerts], appointments: [...seedState.appointments], accounts: [...seedState.accounts], adminProfiles: [], patients: [], notifications: [] }
}

export function loadDatabase(): StoredState {
  try {
    const stored = window.localStorage.getItem(databaseKey)
    if (!stored) return cloneSeed()
    const parsed = JSON.parse(stored) as Partial<StoredState>
    return {
      routineDone: Array.isArray(parsed.routineDone) ? parsed.routineDone : [...seedState.routineDone],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [...seedState.alerts],
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [...seedState.appointments],
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts.map((account) => ({ ...account, access: account.access ?? 'active' })) : [...seedState.accounts],
      adminProfiles: Array.isArray(parsed.adminProfiles) ? parsed.adminProfiles : [],
      patients: Array.isArray(parsed.patients) ? parsed.patients : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    }
  } catch {
    return cloneSeed()
  }
}

export function saveDatabase(state: StoredState) {
  window.localStorage.setItem(databaseKey, JSON.stringify(state))
}

export function resetDatabase() {
  saveDatabase(cloneSeed())
}
