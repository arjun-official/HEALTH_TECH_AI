import {
    Activity, AlertTriangle, Ambulance, ArrowRight, Bell, CalendarDays, Check, ChevronRight,
    CircleHelp, ClipboardList, Clock3, FileText, HeartPulse, Home, LogOut, Menu,
    Pill, Plus, Search, ShieldCheck, Siren, Stethoscope, Users, X, Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AdminOnboarding, AdminWorkspace } from './AdminWorkflow'
import { CreateAccountForm } from './CreateAccountForm'
import { loadDatabase, saveDatabase, type Account } from './db'
import { DoctorPortal } from './DoctorPortal'
import { loadPatientDashboardData, type Observation, type PatientAppointment, type PatientDashboardData } from './patientData'
import { signInWithGoogle, supabase } from './supabase'
import './style.css'

type Role = 'patient' | 'admin' | 'doctor' | 'emergency'
type Icon = typeof Home

type NavItem = { label: string; path: string; icon: Icon }

type User = Account & { authUserId?: string }

const nav: Record<Role, NavItem[]> = {
  patient: [
    { label: 'Overview', path: '/patient/dashboard', icon: Home },
    { label: 'My health', path: '/patient/health', icon: HeartPulse },
    { label: 'Routines', path: '/patient/routines', icon: ClipboardList },
    { label: 'Medications', path: '/patient/medications', icon: Pill },
    { label: 'Appointments', path: '/patient/appointments', icon: CalendarDays },
    { label: 'Records', path: '/patient/reports', icon: FileText },
  ],
  admin: [
    { label: 'Overview', path: '/admin/dashboard', icon: Home },
    { label: 'My patients', path: '/admin/patients', icon: Users },
    { label: 'Add member', path: '/admin/members/new', icon: Plus },
    { label: 'Monitoring', path: '/admin/monitoring', icon: Activity },
    { label: 'Alerts', path: '/admin/alerts', icon: Bell },
    { label: 'Appointments', path: '/admin/appointments', icon: CalendarDays },
  ],
  doctor: [
    { label: 'Overview', path: '/doctor/dashboard', icon: Home },
    { label: 'Patients', path: '/doctor/patients', icon: Users },
    { label: 'Appointments', path: '/doctor/appointments', icon: CalendarDays },
    { label: 'Prescriptions', path: '/doctor/prescriptions', icon: Pill },
    { label: 'Alerts', path: '/doctor/alerts', icon: Bell },
  ],
  emergency: [
    { label: 'Command center', path: '/emergency/dashboard', icon: Home },
    { label: 'Live requests', path: '/emergency/requests', icon: Siren },
    { label: 'Ambulances', path: '/emergency/ambulances', icon: Ambulance },
    { label: 'Case history', path: '/emergency/history', icon: ClipboardList },
  ],
}

const patients = [
  { name: 'Eleanor Wright', initials: 'EW', detail: 'Hypertension · Age 68', status: 'Attention required', rate: '78 bpm', updated: '2 min ago', color: 'amber' },
  { name: 'Alex Morgan', initials: 'AM', detail: 'Post-op recovery · Age 34', status: 'Stable', rate: '64 bpm', updated: '5 min ago', color: 'green' },
  { name: 'Samuel Ortiz', initials: 'SO', detail: 'Type 2 diabetes · Age 57', status: 'Stable', rate: '72 bpm', updated: '11 min ago', color: 'green' },
  { name: 'Priya Shah', initials: 'PS', detail: 'Asthma · Age 29', status: 'Review today', rate: '88 bpm', updated: '18 min ago', color: 'blue' },
]

const appointments = [
  { time: '09:30', person: 'Eleanor Wright', type: 'Follow-up consultation', status: 'Confirmed' },
  { time: '11:00', person: 'Alex Morgan', type: 'Recovery review', status: 'Awaiting check-in' },
  { time: '14:15', person: 'Samuel Ortiz', type: 'Routine review', status: 'Confirmed' },
]

function getRolePath(role: Role) { return `/${role}/dashboard` }

function isRole(value: unknown): value is Role {
  return value === 'patient' || value === 'admin' || value === 'doctor' || value === 'emergency'
}

function getRoleTitle(role: Role) {
  const titles: Record<Role, string> = {
    patient: 'Patient account',
    admin: 'Family administrator',
    doctor: 'Clinical professional',
    emergency: 'Emergency operations',
  }
  return titles[role]
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

async function loadAppUser(authUser: { id: string; email?: string | null; user_metadata?: { full_name?: string }; app_metadata?: { providers?: string[] } }): Promise<User | null> {
  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('user_id', authUser.id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', authUser.id),
  ])
  if (profileError) throw new Error(`Could not load your profile: ${profileError.message}`)
  if (rolesError) throw new Error(`Could not load your account role: ${rolesError.message}`)

  const role = roleRows?.[0]?.role
  if (!isRole(role)) return null

  return {
    authUserId: authUser.id,
    email: authUser.email ?? '',
    password: '',
    role,
    name: (authUser.app_metadata?.providers?.includes('google') && authUser.user_metadata?.full_name)
      || profile?.full_name
      || authUser.email
      || 'VITALYX user',
    title: getRoleTitle(role),
    access: 'active',
  }
}

function App() {
  const [database, setDatabase] = useState(loadDatabase)
  const [user, setUser] = useState<User | null>(null)
  const [path, setPath] = useState(window.location.pathname || '/')
  const [loginError, setLoginError] = useState('')
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [showEmergency, setShowEmergency] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem('vitalyx-dark-mode') === 'true')

  useEffect(() => {
    let alive = true
    const showRestoreError = (message: string) => {
      if (!alive) return
      setLoginError(message)
      setPath('/login')
      window.history.replaceState({}, '', '/login')
    }
    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!alive || !data.session?.user) {
          if (error) showRestoreError(error.message)
          return
        }
        if (error) {
          showRestoreError(error.message)
          return
        }
        const restoredUser = await loadAppUser(data.session.user)
        if (!alive) return
        if (!restoredUser) {
          const { error: signOutError } = await supabase.auth.signOut()
          showRestoreError(signOutError
            ? `Your account has no approved VITALYX role, and sign-out failed: ${signOutError.message}`
            : 'Your account has no approved VITALYX role. Contact an administrator.')
          return
        }
        setUser(restoredUser)
      } catch (error) {
        showRestoreError(getErrorMessage(error))
      }
    }
    void restoreSession()
    return () => { alive = false }
  }, [])

  const navigate = (nextPath: string) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
    setMobileNav(false)
  }

  const login = async (email: string, password: string) => {
    setLoginError('')
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError || !authData.user) {
        setLoginError(authError?.message ?? 'Sign in failed.')
        return
      }
      const signedInUser = await loadAppUser(authData.user)
      if (!signedInUser) {
        const { error: signOutError } = await supabase.auth.signOut()
        setLoginError(signOutError
          ? `Your account has no approved VITALYX role, and sign-out failed: ${signOutError.message}`
          : 'Your account has no approved VITALYX role. Contact an administrator.')
        return
      }
      setUser(signedInUser)
      navigate(getRolePath(signedInUser.role))
    } catch (error) {
      setLoginError(getErrorMessage(error))
    }
  }

  const loginWithGoogle = async () => {
    setLoginError('')
    setIsGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (error) {
      setLoginError(getErrorMessage(error))
      setIsGoogleLoading(false)
    }
  }

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        window.alert(`Sign out failed: ${error.message}`)
        return
      }
      setUser(null)
      navigate('/')
    } catch (error) {
      window.alert(`Sign out failed: ${getErrorMessage(error)}`)
    }
  }

  if (!user && path === '/') return <Landing onLogin={() => navigate('/login')} onStart={() => navigate('/login')} />
  if (!user && path === '/login') return <Login onLogin={login} onGoogleLogin={loginWithGoogle} isGoogleLoading={isGoogleLoading} error={loginError} onBack={() => navigate('/')} onCreateAccount={() => navigate('/register')} />
  if (!user && path === '/register') return <Register database={database} updateDatabase={(nextDatabase) => { setDatabase(nextDatabase); saveDatabase(nextDatabase) }} onBack={() => navigate('/login')} onCreated={() => navigate('/login')} allowPatient={false} />
  if (!user) return <Login onLogin={login} onGoogleLogin={loginWithGoogle} isGoogleLoading={isGoogleLoading} error="Please sign in to continue." onBack={() => navigate('/')} onCreateAccount={() => navigate('/register')} />

  const updateDatabase = (nextDatabase: typeof database) => { setDatabase(nextDatabase); saveDatabase(nextDatabase) }
  const toggleDarkMode = () => { const next = !darkMode; setDarkMode(next); window.localStorage.setItem('vitalyx-dark-mode', String(next)) }
  const updateUser = (nextUser: User) => { setUser(nextUser); updateDatabase({ ...database, accounts: database.accounts.map((account) => account.email === nextUser.email ? nextUser : account) }) }
  if (user.role === 'admin' && !user.onboardingComplete) return <AdminOnboarding user={user} database={database} updateDatabase={updateDatabase} updateUser={updateUser} navigate={navigate} />
  return <AppShell user={user} path={path} navigate={navigate} mobileNav={mobileNav} setMobileNav={setMobileNav} logout={logout} database={database} updateDatabase={updateDatabase} showEmergency={showEmergency} setShowEmergency={setShowEmergency} darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
}

function Register({ database, updateDatabase, onBack, onCreated, allowPatient }: { database: ReturnType<typeof loadDatabase>; updateDatabase: (database: ReturnType<typeof loadDatabase>) => void; onBack: () => void; onCreated: () => void; allowPatient: boolean }) {
  return <CreateAccountForm database={database} updateDatabase={updateDatabase} onBack={onBack} onCreated={onCreated} isAdminAddingMember={allowPatient} />
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [profession, setProfession] = useState('')
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Account['role']>(allowPatient ? 'patient' : 'admin')
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (database.accounts.some((account) => account.email === email)) { setError('An account already exists for that email address.'); return }
    const titles: Record<Account['role'], string> = { patient: 'Patient account', admin: 'Family administrator', doctor: 'Clinical professional', emergency: 'Emergency support' }
    const account: Account = { email, password, role, name, title: titles[role], dateOfBirth, profession, address, access: role === 'doctor' || role === 'emergency' ? 'pending' : 'active' }
    updateDatabase({ ...database, accounts: [...database.accounts, account] })
    setCreated(true)
  }

  return <div className="login-page"><button className="login-back" onClick={onBack}><ChevronRight size={16} className="rotate-back" /> Back to members</button><div className="register-layout"><div className="register-intro"><Brand /><span className="eyebrow">Authorised onboarding</span><h1>Add a new<br /><em>member.</em></h1><p>Enter the member’s details once. You can repeat this process for as many authorised people as your care circle needs.</p><div className="notice-banner"><ShieldCheck size={18} /><span>Doctor and emergency support accounts remain pending until special permission is granted.</span></div></div><div className="login-card"><div className="card-kicker">New member</div>{created ? <div className="register-success"><span><Check size={23} /></span><h2>Member added</h2><p>The member account has been saved and can use the assigned login once approved.</p><button className="button button-primary button-wide" onClick={onCreated}>Return to members</button></div> : <><h2>Create account</h2><p className="muted">Add the member’s profile and login details.</p><form onSubmit={submit}><label>Mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Name<input type="text" value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Date of birth<input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required /></label><label>Profession<input type="text" value={profession} onChange={(event) => setProfession(event.target.value)} required /></label><label>Address<input type="text" value={address} onChange={(event) => setAddress(event.target.value)} required /></label><label>Login as<select value={role} onChange={(event) => setRole(event.target.value as Account['role'])}><option value="patient">Patient</option><option value="admin">Family administrator</option><option value="doctor">Doctor · special permission required</option><option value="emergency">Emergency support · special permission required</option></select></label><label>Temporary password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></label>{error && <div className="form-error"><AlertTriangle size={15} />{error}</div>}<button className="button button-primary button-wide" type="submit">Add member <ArrowRight size={17} /></button></form></>}</div></div></div>
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-mark"><HeartPulse size={18} strokeWidth={2.5} /></span><span>VITALYX</span></div>
}

function Landing({ onLogin, onStart }: { onLogin: () => void; onStart: () => void }) {
  return <div className="public-page"><header className="public-nav"><Brand /><nav><a href="#features">Platform</a><a href="#how">How it works</a><a href="#about">About</a></nav><button className="button button-ghost" onClick={onLogin}>Sign in <ArrowRight size={16} /></button></header><main className="landing-main"><section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" /> A calmer way to care</div><h1>Your health,<br /><em>understood.</em></h1><p>One connected space for everyday health, trusted care teams, and the people who matter most.</p><div className="hero-actions"><button className="button button-primary" onClick={onStart}>Explore VITALYX <ArrowRight size={17} /></button><button className="text-button" onClick={() => document.querySelector('#how')?.scrollIntoView({ behavior: 'smooth' })}>See how it works <ChevronRight size={16} /></button></div><div className="trust-row"><div className="avatar-stack"><span>AM</span><span>EW</span><span>JL</span></div><div><strong>Built for real care teams</strong><small>Patients, families, doctors and dispatch</small></div></div></div><div className="hero-visual"><div className="orbital orbital-one" /><div className="orbital orbital-two" /><div className="health-card"><div className="health-card-top"><span>Today’s snapshot</span><span className="live-dot"><i /> LIVE</span></div><div className="health-score"><div><small>Overall health</small><strong>Good morning, Alex</strong></div><span className="score-ring">86</span></div><div className="mini-chart"><div className="chart-line" /><div className="chart-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span></div></div><div className="vitals-row"><div><HeartPulse size={16} /><strong>64</strong><small>BPM</small></div><div><Activity size={16} /><strong>8.4k</strong><small>STEPS</small></div><div><Zap size={16} /><strong>7h 42m</strong><small>SLEEP</small></div></div></div><div className="floating-note"><span className="note-icon"><Check size={15} /></span><div><strong>Routine complete</strong><small>3 of 5 tasks today</small></div></div></div></section><section id="features" className="feature-strip"><div><span className="section-number">01</span><h2>One view of what matters.</h2><p>Simple enough for patients. Powerful enough for the teams around them.</p></div><div className="feature-grid"><Feature icon={HeartPulse} title="Daily health" text="See the signals that shape your day, clearly and calmly." /><Feature icon={Stethoscope} title="Connected care" text="Keep appointments, records and people in sync." /><Feature icon={ShieldCheck} title="Ready when needed" text="Move from concern to coordinated help without the noise." /></div></section><section id="how" className="how-section"><div><span className="eyebrow">A shared picture</span><h2>Care works better<br />when it connects.</h2></div><div className="how-steps"><div><b>01</b><strong>Notice</strong><span>Understand patterns in everyday health.</span></div><div><b>02</b><strong>Connect</strong><span>Share the right context with trusted people.</span></div><div><b>03</b><strong>Respond</strong><span>Coordinate support when it matters.</span></div></div></section></main><footer className="public-footer"><Brand compact /><span>Demonstration product · Not for clinical use</span><span>© 2026 VITALYX</span></footer></div>
}

function Feature({ icon: FeatureIcon, title, text }: { icon: Icon; title: string; text: string }) { return <article className="feature-item"><span className="feature-icon"><FeatureIcon size={20} /></span><h3>{title}</h3><p>{text}</p></article> }

function Login({ onLogin, onGoogleLogin, isGoogleLoading, error, onBack, onCreateAccount }: { onLogin: (email: string, password: string) => void; onGoogleLogin: () => void; isGoogleLoading: boolean; error: string; onBack: () => void; onCreateAccount: () => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false)
  return <div className="login-page"><button className="login-back" onClick={onBack}><ChevronRight size={16} className="rotate-back" /> Back to home</button><div className="login-layout"><div className="login-intro"><Brand /><div><span className="eyebrow">Welcome back</span><h1>Care, in one<br /><em>clear place.</em></h1><p>Your health dashboard is ready when you are. Sign in to continue.</p></div></div><div className="login-card"><div className="card-kicker">Secure sign in</div><h2>Continue to VITALYX</h2><p className="muted">Enter your account details to continue.</p><form onSubmit={(event) => { event.preventDefault(); onLogin(email, password) }}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>{error && <div className="form-error"><AlertTriangle size={15} />{error}</div>}<button className="button button-primary button-wide" type="submit">Sign in <ArrowRight size={17} /></button></form><div className="auth-divider"><span>or</span></div><button className="button button-google button-wide" type="button" onClick={onGoogleLogin} disabled={isGoogleLoading}><span className="google-mark" aria-hidden="true">G</span>{isGoogleLoading ? 'Redirecting to Google...' : 'Continue with Google'}</button><button className="create-account-link" onClick={onCreateAccount}>Create account <ArrowRight size={15} /></button><div className="login-foot"><ShieldCheck size={15} /> Protected access</div></div></div></div>
}

function AppShell({ user, path, navigate, mobileNav, setMobileNav, logout, database, updateDatabase, showEmergency, setShowEmergency, darkMode, toggleDarkMode }: { user: User; path: string; navigate: (nextPath: string) => void; mobileNav: boolean; setMobileNav: (value: boolean) => void; logout: () => void; database: ReturnType<typeof loadDatabase>; updateDatabase: (database: ReturnType<typeof loadDatabase>) => void; showEmergency: boolean; setShowEmergency: (value: boolean) => void; darkMode: boolean; toggleDarkMode: () => void }) {
  const safePath = path.startsWith(`/${user.role}/`) ? path : getRolePath(user.role)
  useEffect(() => { if (safePath !== path) navigate(safePath) }, [navigate, path, safePath])
  const currentNav = nav[user.role]; const currentItem = currentNav.find((item) => safePath === item.path) ?? currentNav[0]
  return <div className={`app-shell role-${user.role} ${darkMode ? 'dark-mode' : ''}`}><aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><div className="sidebar-head"><Brand /><button className="mobile-close" onClick={() => setMobileNav(false)}><X size={20} /></button></div><div className="role-switch"><span className="avatar">{user.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span><span><strong>{user.name}</strong><small>{user.title}</small></span><ChevronRight size={14} /></div><nav className="side-nav">{currentNav.map((item) => <button key={item.path} className={currentItem.path === item.path ? 'active' : ''} onClick={() => navigate(item.path)}><item.icon size={18} /><span>{item.label}</span></button>)}</nav><div className="sidebar-bottom"><button className="support-link" onClick={() => navigate(`/${user.role}/support`)}><CircleHelp size={17} /> Help & support</button><button className="logout-link" onClick={logout}><LogOut size={17} /> Sign out</button><div className="privacy-note"><ShieldCheck size={15} /><span>{user.role === 'patient' ? <>Read-only patient data<br />Other areas may be demo</> : <>Demo environment<br />No real medical data</>}</span></div></div></aside><div className="main-column"><header className="app-header"><button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={21} /></button><div><span className="breadcrumb">{user.role === 'emergency' ? 'Operations' : 'Workspace'} <ChevronRight size={13} /> {currentItem.label}</span><h1>{currentItem.label}</h1></div><div className="header-actions"><button className="icon-button theme-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode">{darkMode ? '☀' : '☾'}</button><button className="icon-button notification-button" onClick={() => navigate(`/${user.role}/alerts`)}><Bell size={18} /><i /></button><div className="header-user"><span className="avatar avatar-sm">{user.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span><span><strong>{user.name}</strong><small>{user.role === 'patient' ? 'Personal space' : user.title}</small></span></div></div></header><main className="content"><RolePage user={user} path={safePath} navigate={navigate} database={database} updateDatabase={updateDatabase} setShowEmergency={setShowEmergency} darkMode={darkMode} toggleDarkMode={toggleDarkMode} /></main></div>{showEmergency && <EmergencyModal close={() => setShowEmergency(false)} />}</div>
}

function RolePage({ user, path, navigate, database, updateDatabase, setShowEmergency, darkMode, toggleDarkMode }: { user: User; path: string; navigate: (nextPath: string) => void; database: ReturnType<typeof loadDatabase>; updateDatabase: (database: ReturnType<typeof loadDatabase>) => void; setShowEmergency: (value: boolean) => void; darkMode: boolean; toggleDarkMode: () => void }) {
  if (user.role === 'patient') return <PatientWorkspace user={user} path={path} navigate={navigate} database={database} updateDatabase={updateDatabase} setShowEmergency={setShowEmergency} />
  if (user.role === 'admin') return <AdminWorkspace user={user} database={database} updateDatabase={updateDatabase} navigate={navigate} />
  if (user.role === 'doctor') return <DoctorPortal user={user} path={path} navigate={navigate} database={database} updateDatabase={updateDatabase} darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
  return <EmergencyPage path={path} navigate={navigate} />
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: React.ReactNode }) { return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div> }
function StatCard({ label, value, note, icon: StatIcon, tone = 'blue' }: { label: string; value: string; note: string; icon: Icon; tone?: string }) { return <div className="stat-card"><span className={`stat-icon ${tone}`}><StatIcon size={19} /></span><div><small>{label}</small><strong>{value}</strong><span className={`stat-note ${tone}`}>{note}</span></div></div> }
function StatusPill({ children, tone = 'green' }: { children: React.ReactNode; tone?: string }) { return <span className={`status-pill ${tone}`}><i />{children}</span> }
type PatientLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: PatientDashboardData }

function PatientWorkspace({ user, path, navigate, database, updateDatabase, setShowEmergency }: { user: User; path: string; navigate: (nextPath: string) => void; database: ReturnType<typeof loadDatabase>; updateDatabase: (database: ReturnType<typeof loadDatabase>) => void; setShowEmergency: (value: boolean) => void }) {
  const [loadState, setLoadState] = useState<PatientLoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoadState({ status: 'loading' })
    if (!user.authUserId) {
      setLoadState({ status: 'error', message: 'Your authenticated account could not be identified. Sign out and sign in again.' })
      return () => { active = false }
    }

    void loadPatientDashboardData(user.authUserId)
      .then((data) => { if (active) setLoadState({ status: 'ready', data }) })
      .catch((error: unknown) => {
        if (active) setLoadState({ status: 'error', message: getErrorMessage(error) })
      })
    return () => { active = false }
  }, [attempt, user.authUserId])

  if (loadState.status === 'loading') return <div className="panel data-state" role="status">Loading your patient data…</div>
  if (loadState.status === 'error') return <div className="panel data-state" role="alert"><strong>Patient data could not be loaded</strong><p>{loadState.message}</p><button className="button button-primary" onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>

  return <PatientPage user={user} path={path} navigate={navigate} database={database} updateDatabase={updateDatabase} setShowEmergency={setShowEmergency} dashboard={loadState.data} />
}

function normalizeObservationCode(code: string) {
  return code.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function observationLabel(code: string) {
  const labels: Record<string, string> = {
    heart_rate: 'Heart rate',
    heartrate: 'Heart rate',
    resting_heart_rate: 'Resting heart rate',
    blood_oxygen: 'Blood oxygen',
    spo2: 'Blood oxygen',
    oxygen_saturation: 'Blood oxygen',
    hrv: 'Heart rate variability',
    skin_temperature: 'Skin temperature',
    activity: 'Activity',
    steps: 'Steps',
    step_count: 'Steps',
    sleep: 'Sleep',
    sleep_duration: 'Sleep duration',
  }
  const normalized = normalizeObservationCode(code)
  return labels[normalized] ?? normalized.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function latestObservations(observations: Observation[]) {
  const latest = new Map<string, Observation>()
  for (const observation of observations) {
    const key = normalizeObservationCode(observation.code)
    if (!latest.has(key)) latest.set(key, observation)
  }
  return [...latest.values()]
}

function formatRecordedAt(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString()
}

function formatAppointmentDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function PatientPage({ user, path, navigate, database, updateDatabase, setShowEmergency, dashboard }: { user: User; path: string; navigate: (nextPath: string) => void; database: ReturnType<typeof loadDatabase>; updateDatabase: (database: ReturnType<typeof loadDatabase>) => void; setShowEmergency: (value: boolean) => void; dashboard: PatientDashboardData }) {
  const recentObservations = latestObservations(dashboard.observations)

  if (path === '/patient/health') return <PatientHealth observations={dashboard.observations} />
  if (path === '/patient/routines') return <RoutinePage routineDone={database.routineDone} setRoutineDone={(routineDone) => updateDatabase({ ...database, routineDone })} />
  if (path === '/patient/medications') return <MedicationPage />
  if (path === '/patient/appointments') return <AppointmentsPage appointments={dashboard.appointments} count={dashboard.upcomingAppointmentCount} />
  if (path === '/patient/reports') return <RecordsPage />
  return <>
    <PageHeading eyebrow="Patient dashboard" title={`Welcome, ${user.name}`} subtitle="Your patient information from VITALYX." action={<button className="button button-danger" onClick={() => setShowEmergency(true)}><Siren size={17} /> Need urgent help</button>} />
    {!dashboard.patientId && <div className="notice-banner"><span><ShieldCheck size={18} /><strong>Patient profile not found</strong><small>Ask an administrator to verify the patient account setup.</small></span></div>}
    <div className="stats-grid">
      <StatCard label="Recent readings" value={String(dashboard.observations.length)} note="Latest readings loaded" icon={HeartPulse} tone="blue" />
      <StatCard label="Open alerts" value={String(dashboard.openAlertsCount)} note="Authorized active alerts" icon={AlertTriangle} tone={dashboard.openAlertsCount ? 'amber' : 'green'} />
      <StatCard label="Upcoming appointments" value={String(dashboard.upcomingAppointmentCount)} note="Scheduled appointments" icon={CalendarDays} tone="violet" />
      <StatCard label="Demo routine progress" value={`${database.routineDone.filter(Boolean).length} / 5`} note="Stored in this browser only" icon={ClipboardList} tone="blue" />
    </div>
    <div className="dashboard-grid">
      <section className="panel health-panel">
        <div className="panel-heading"><div><span className="eyebrow">Patient record</span><h3>Latest health readings</h3></div><button className="icon-button" onClick={() => navigate('/patient/health')} aria-label="View all health readings"><ArrowRight size={17} /></button></div>
        {recentObservations.length ? <div className="metric-list">{recentObservations.slice(0, 4).map((observation) => <MetricRow key={`${observation.id}-${observation.measured_at}`} label={observationLabel(observation.code)} value={String(observation.value)} unit={observation.unit} note={formatRecordedAt(observation.measured_at)} trend="Recorded" icon={Activity} tone="blue" />)}</div> : <div className="empty-state">No health readings are available yet.</div>}
      </section>
      <section className="panel routine-panel">
        <div className="panel-heading"><div><span className="eyebrow">Demo workflow</span><h3>Daily routine</h3></div><button className="text-button" onClick={() => navigate('/patient/routines')}>See all <ArrowRight size={15} /></button></div>
        <div className="routine-progress"><div><strong>{database.routineDone.filter(Boolean).length} of 5</strong><span>tasks completed locally</span></div><div className="progress-bar"><i style={{ width: `${database.routineDone.filter(Boolean).length * 20}%` }} /></div></div>
        <div className="task-list">{['Morning medication', '20 minute walk', 'Drink 6 glasses of water'].map((task, index) => <button className={`task-row ${database.routineDone[index] ? 'done' : ''}`} key={task} onClick={() => { const next = [...database.routineDone]; next[index] = !next[index]; updateDatabase({ ...database, routineDone: next }) }}><span className="check-box">{database.routineDone[index] && <Check size={14} />}</span><span>{task}</span>{database.routineDone[index] ? <small>Done</small> : <ChevronRight size={15} />}</button>)}</div>
      </section>
    </div>
    <div className="bottom-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Next up</span><h3>Appointments</h3></div><button className="text-button" onClick={() => navigate('/patient/appointments')}>View calendar <ArrowRight size={15} /></button></div>
        {dashboard.appointments[0] ? <div className="simple-row"><span className="time-block">{formatAppointmentDate(dashboard.appointments[0].starts_at)}</span><div><strong>{dashboard.appointments[0].appointment_type}</strong><span>{dashboard.appointments[0].status}</span></div></div> : <div className="empty-state">No upcoming appointments are available.</div>}
      </section>
      <section className="panel alert-panel">
        <div className="panel-heading"><div><span className="eyebrow">Patient record</span><h3>Recent alerts</h3></div><Bell size={18} className="muted-icon" /></div>
        {dashboard.alerts.length ? dashboard.alerts.slice(0, 3).map((alert) => <div className="alert-row" key={alert.id}><span className="alert-symbol"><AlertTriangle size={17} /></span><div><strong>{alert.summary || alert.type}</strong><span>{formatRecordedAt(alert.created_at)}</span></div><StatusPill tone="amber">{alert.status}</StatusPill></div>) : <div className="empty-state"><Check size={18} /> No open alerts.</div>}
      </section>
    </div>
  </>
}

function MetricRow({ label, value, unit, note, trend, icon: MetricIcon, tone }: { label: string; value: string; unit: string; note: string; trend: string; icon: Icon; tone: string }) { return <div className="metric-row"><span className={`metric-icon ${tone}`}><MetricIcon size={17} /></span><div><strong>{label}</strong><small>{note}</small></div><div className="metric-value"><strong>{value}<small>{unit}</small></strong><span>{trend}</span></div></div> }

function PatientHealth({ observations }: { observations: Observation[] }) {
  const latest = latestObservations(observations)
  return <>
    <PageHeading eyebrow="Health monitoring" title="Your health picture" subtitle="Read-only measurements from your patient record." />
    {latest.length
      ? <div className="health-grid">{latest.map((observation) => <div className="health-metric-card" key={`${observation.id}-${observation.measured_at}`}><div className="metric-card-top"><span className="metric-icon blue"><Activity size={17} /></span><StatusPill tone="blue">Recorded</StatusPill></div><small>{observationLabel(observation.code)}</small><strong>{observation.value}<em>{observation.unit}</em></strong><span className="metric-note">{formatRecordedAt(observation.measured_at)}</span></div>)}</div>
      : <div className="panel data-state">No health measurements are available in your patient record yet.</div>}
    <div className="panel insight-panel"><div className="insight-icon"><ShieldCheck size={19} /></div><div><strong>Measurements shown as recorded</strong><p>These values are not interpreted as a diagnosis or medical recommendation. Contact your care team with questions.</p></div></div>
  </>
}

function RoutinePage({ routineDone, setRoutineDone }: { routineDone: boolean[]; setRoutineDone: (value: boolean[]) => void }) { const tasks = ['Morning medication', 'Morning walk', 'Drink sufficient water', 'Light exercise', 'Evening medication']; return <><PageHeading eyebrow="Demo routine" title="Small steps, steady progress" subtitle="Sample tasks stored in this browser; not prescribed care." /><div className="routine-layout"><section className="panel routine-large"><div className="routine-summary"><div className="big-progress"><strong>{Math.round(routineDone.filter(Boolean).length / tasks.length * 100)}%</strong><span>complete today</span></div><div><h3>Demo routine</h3><p>{routineDone.filter(Boolean).length === tasks.length ? 'You’ve completed everything. Wonderful work.' : 'You’re building a good rhythm. Keep going.'}</p></div></div>{tasks.map((task, index) => <button className={`large-task ${routineDone[index] ? 'done' : ''}`} key={task} onClick={() => { const next = [...routineDone]; next[index] = !next[index]; setRoutineDone(next) }}><span className="check-box">{routineDone[index] && <Check size={15} />}</span><span><strong>{task}</strong><small>{index === 0 || index === 4 ? 'Example only · not a prescription' : 'Example wellbeing task'}</small></span><span className="task-time">{index < 2 ? 'Morning' : index === 4 ? 'Evening' : 'Anytime'}</span></button>)}</section><aside className="panel week-panel"><span className="eyebrow">Demo data</span><h3>Consistency</h3><div className="week-bars">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <div key={`${day}-${index}`}><i style={{ height: `${[78, 64, 46, 22, 12, 8, 8][index]}%` }} /><small>{day}</small></div>)}</div><strong className="week-score">82% <small>sample weekly average</small></strong></aside></div></> }

function MedicationPage() { return <><PageHeading eyebrow="Demo medication list" title="Sample medications" subtitle="Example content only; prescriptions are not connected to your care team." /><div className="medication-list">{[['Lisinopril', '10 mg', 'Once daily · Morning', 'Take with or without food'], ['Vitamin D3', '1000 IU', 'Once daily · Morning', 'Take with breakfast'], ['Atorvastatin', '20 mg', 'Once daily · Evening', 'Take at bedtime']].map(([name, dose, timing, instruction]) => <div className="panel medication-card" key={name}><span className="pill-icon"><Pill size={19} /></span><div><h3>{name}</h3><strong>{dose}</strong><p>{timing}</p><small>{instruction}</small></div><StatusPill>Example</StatusPill></div>)}</div><div className="info-callout"><CircleHelp size={18} /><span><strong>Need medication advice?</strong> Contact your clinician. This page does not display your actual prescriptions.</span></div></> }
function AppointmentsPage({ appointments, count }: { appointments: PatientAppointment[]; count: number }) {
  return <>
    <PageHeading eyebrow="Care calendar" title="Appointments" subtitle="Upcoming appointments from your patient record." />
    <div className="panel table-panel">
      <div className="table-heading"><h3>Upcoming</h3><span>{count} appointments</span></div>
      {appointments.length
        ? appointments.map((appointment) => <div className="appointment-row detailed" key={appointment.id}><span className="date-tile"><b>{new Date(appointment.starts_at).toLocaleDateString(undefined, { day: '2-digit' })}</b><small>{new Date(appointment.starts_at).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</small></span><div><strong>{appointment.appointment_type}</strong><span>{formatAppointmentDate(appointment.starts_at)}</span></div><StatusPill tone={appointment.status.toLowerCase() === 'confirmed' ? 'green' : 'blue'}>{appointment.status}</StatusPill></div>)
        : <div className="empty-state">No upcoming appointments are available.</div>}
    </div>
  </>
}
function RecordsPage() { return <><PageHeading eyebrow="Demo records" title="Sample medical records" subtitle="Example content only; these files are not connected to your medical history." /><div className="record-grid"><div className="panel record-card"><span className="record-icon blue"><FileText size={19} /></span><div><strong>Recovery consultation</strong><span>Example · 12 Nov 2026</span></div><ChevronRight size={16} /></div><div className="panel record-card"><span className="record-icon amber"><FileText size={19} /></span><div><strong>Blood test results</strong><span>Example · 04 Nov 2026</span></div><ChevronRight size={16} /></div><div className="panel record-card"><span className="record-icon green"><Pill size={19} /></span><div><strong>Sample prescriptions</strong><span>Example content only</span></div><ChevronRight size={16} /></div></div></> }

function LegacyAdminPage({ path, navigate }: { path: string; navigate: (nextPath: string) => void }) { if (path === '/admin/patients' || path === '/admin/monitoring') return <><PageHeading eyebrow="Family care" title="People you care for" subtitle="A clear view of your authorised family members." action={<button className="button button-primary"><Plus size={17} /> Add patient</button>} /><div className="stats-grid"><StatCard label="Patients monitored" value="4" note="All connections active" icon={Users} tone="blue" /><StatCard label="Need attention" value="1" note="Review today" icon={AlertTriangle} tone="amber" /><StatCard label="Active alerts" value="2" note="1 acknowledged" icon={Bell} tone="red" /><StatCard label="Next appointment" value="09:30" note="Eleanor Wright" icon={CalendarDays} tone="green" /></div><div className="panel table-panel"><div className="table-heading"><h3>Monitoring overview</h3><div className="search-box"><Search size={16} /><input placeholder="Search patients" /></div></div>{patients.map((patient) => <div className="patient-row" key={patient.name}><span className="avatar avatar-sm">{patient.initials}</span><div className="patient-name"><strong>{patient.name}</strong><span>{patient.detail}</span></div><div className="patient-reading"><small>Heart rate</small><strong>{patient.rate}</strong></div><div><StatusPill tone={patient.color}>{patient.status}</StatusPill><small className="updated">Updated {patient.updated}</small></div><button className="icon-button" onClick={() => navigate('/admin/patients/1')}><ChevronRight size={17} /></button></div>)}</div></>; return <><PageHeading eyebrow="Family care" title="Good morning, Maya" subtitle="Here’s what needs your attention today." /><div className="notice-banner"><span><ShieldCheck size={18} /><strong>All patients are connected</strong><small>One person in your care may need a review today.</small></span><button className="text-button" onClick={() => navigate('/admin/monitoring')}>Open monitoring <ArrowRight size={15} /></button></div><div className="stats-grid"><StatCard label="Registered patients" value="4" note="Across your care circle" icon={Users} tone="blue" /><StatCard label="Monitoring now" value="4 / 4" note="All devices online" icon={Activity} tone="green" /><StatCard label="Needs attention" value="1" note="Eleanor Wright" icon={AlertTriangle} tone="amber" /><StatCard label="Appointments" value="3" note="This week" icon={CalendarDays} tone="violet" /></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Monitoring</span><h3>Family overview</h3></div><button className="text-button" onClick={() => navigate('/admin/monitoring')}>View all <ArrowRight size={15} /></button></div>{patients.slice(0, 3).map((patient) => <div className="patient-row compact" key={patient.name}><span className="avatar avatar-sm">{patient.initials}</span><div className="patient-name"><strong>{patient.name}</strong><span>{patient.rate} · Updated {patient.updated}</span></div><StatusPill tone={patient.color}>{patient.status}</StatusPill></div>)}</section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Today</span><h3>Upcoming appointments</h3></div></div>{appointments.slice(0, 2).map((item) => <div className="simple-row" key={item.time}><span className="time-block">{item.time}</span><div><strong>{item.person}</strong><span>{item.type}</span></div></div>)}</section></div></> }

void LegacyAdminPage

function DoctorPage({ path, navigate }: { path: string; navigate: (nextPath: string) => void }) { if (path === '/doctor/patients/1') return <ClinicalProfile />; if (path === '/doctor/patients') return <><PageHeading eyebrow="Clinical workspace" title="Patient directory" subtitle="Search and review your assigned patients." /><div className="panel table-panel"><div className="table-heading"><h3>Assigned patients <span className="count-badge">24</span></h3><div className="search-box"><Search size={16} /><input placeholder="Search name or patient ID" /></div></div>{patients.concat([{ name: 'Noah Williams', initials: 'NW', detail: 'Migraine · Age 42', status: 'Stable', rate: '69 bpm', updated: '24 min ago', color: 'green' }]).map((patient, index) => <div className="patient-row doctor-row" key={patient.name}><span className="avatar avatar-sm">{patient.initials}</span><div className="patient-name"><strong>{patient.name}</strong><span>VLX-{1042 + index} · {patient.detail}</span></div><div><small>Last consultation</small><strong>{index + 2} Nov 2026</strong></div><StatusPill tone={patient.color}>{patient.status}</StatusPill><button className="button button-small" onClick={() => navigate('/doctor/patients/1')}>Open profile</button></div>)}</div></>; if (path === '/doctor/prescriptions') return <PrescriptionPage />; return <><PageHeading eyebrow="Clinical workspace" title="Good morning, Jordan" subtitle="A focused view of today’s care priorities." action={<button className="button button-primary" onClick={() => navigate('/doctor/appointments')}><CalendarDays size={17} /> View schedule</button>} /><div className="stats-grid"><StatCard label="Assigned patients" value="24" note="3 new this week" icon={Users} tone="blue" /><StatCard label="Today’s visits" value="8" note="Next at 09:30" icon={CalendarDays} tone="green" /><StatCard label="Pending consults" value="5" note="2 need review" icon={ClipboardList} tone="violet" /><StatCard label="Priority alerts" value="2" note="Requires attention" icon={AlertTriangle} tone="red" /></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Clinical focus</span><h3>Patients requiring attention</h3></div><button className="text-button" onClick={() => navigate('/doctor/patients')}>Directory <ArrowRight size={15} /></button></div>{patients.filter((patient) => patient.color !== 'green').map((patient) => <div className="patient-row compact" key={patient.name}><span className="avatar avatar-sm">{patient.initials}</span><div className="patient-name"><strong>{patient.name}</strong><span>{patient.detail}</span></div><StatusPill tone={patient.color}>{patient.status}</StatusPill><ChevronRight size={16} /></div>)}</section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Schedule</span><h3>Today’s appointments</h3></div></div>{appointments.map((item) => <div className="simple-row" key={item.time}><span className="time-block">{item.time}</span><div><strong>{item.person}</strong><span>{item.type}</span></div><StatusPill tone="blue">{item.status}</StatusPill></div>)}</section></div><section className="panel insight-panel doctor-insight"><div className="insight-icon"><Stethoscope size={19} /></div><div><strong>Risk assessment is for review only</strong><p>Demonstration insights should support clinical judgement, never replace diagnosis or professional care.</p></div></section></> }

void DoctorPage

function ClinicalProfile() { return <><PageHeading eyebrow="Patient profile" title="Eleanor Wright" subtitle="VLX-1042 · Hypertension · Age 68" action={<StatusPill tone="amber">Attention required</StatusPill>} /><div className="stats-grid"><StatCard label="Heart rate" value="78 bpm" note="Slightly above baseline" icon={HeartPulse} tone="amber" /><StatCard label="Blood oxygen" value="97%" note="Within normal range" icon={Activity} tone="green" /><StatCard label="Routine compliance" value="84%" note="This week" icon={ClipboardList} tone="blue" /><StatCard label="Last consultation" value="12 Nov" note="Dr. Jordan Lee" icon={CalendarDays} tone="violet" /></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Clinical notes</span><h3>Medical history</h3></div></div><div className="simple-row"><div><strong>Hypertension</strong><span>Managed with Lisinopril · Ongoing</span></div><StatusPill tone="amber">Monitor</StatusPill></div><div className="simple-row"><div><strong>Annual review</strong><span>Next review recommended in 3 months</span></div><StatusPill tone="blue">Scheduled</StatusPill></div></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Demonstration insight</span><h3>Risk assessment</h3></div></div><div className="insight-panel"><div className="insight-icon"><ShieldCheck size={19} /></div><div><strong>Review recommended</strong><p>This is demonstration data and is not a diagnosis.</p></div></div></section></div></> }
function PrescriptionPage() { return <><PageHeading eyebrow="Clinical workspace" title="Prescriptions" subtitle="Create and review medication plans for your patients." action={<button className="button button-primary"><Plus size={17} /> New prescription</button>} /><div className="panel table-panel"><div className="table-heading"><h3>Recent prescriptions</h3><span>Audit history enabled</span></div>{[['Eleanor Wright', 'Lisinopril', '10 mg · Once daily', 'Active'], ['Alex Morgan', 'Amoxicillin', '500 mg · Twice daily', 'Active'], ['Samuel Ortiz', 'Metformin', '500 mg · Once daily', 'Review due']].map(([patient, medicine, dose, status]) => <div className="prescription-row" key={patient}><span className="pill-icon"><Pill size={18} /></span><div><strong>{medicine}</strong><span>{patient} · {dose}</span></div><StatusPill tone={status === 'Active' ? 'green' : 'amber'}>{status}</StatusPill><button className="icon-button"><ChevronRight size={17} /></button></div>)}</div></> }

function EmergencyPage({ path, navigate }: { path: string; navigate: (nextPath: string) => void }) { if (path === '/emergency/requests') return <><PageHeading eyebrow="Live operations" title="Emergency requests" subtitle="Monitor, acknowledge and coordinate incoming cases." /><div className="panel table-panel emergency-table"><div className="table-heading"><h3>Active queue <span className="count-badge red-badge">3</span></h3><StatusPill tone="red">Live monitoring</StatusPill></div>{[['REQ-2048', 'Eleanor Wright', 'Elevated heart rate', 'Critical', 'North district', 'Pending'], ['REQ-2047', 'Samuel Ortiz', 'Fall detected', 'Urgent', 'West district', 'Acknowledged'], ['REQ-2046', 'Priya Shah', 'Breathing concern', 'Review', 'Central district', 'Assigned']].map(([id, name, concern, severity, location, status]) => <div className="request-row" key={id}><strong>{id}</strong><div><strong>{name}</strong><span>{concern}</span></div><StatusPill tone={severity === 'Critical' ? 'red' : severity === 'Urgent' ? 'amber' : 'blue'}>{severity}</StatusPill><span className="location-label">{location}</span><StatusPill tone={status === 'Pending' ? 'amber' : 'blue'}>{status}</StatusPill><button className="button button-small" onClick={() => navigate('/emergency/requests/2048')}>Review</button></div>)}</div></>; return <><PageHeading eyebrow="Tuesday, 24 November 2026" title="Command center" subtitle="Good morning. Here’s the current response picture." action={<span className="live-status"><i /> All systems operational</span>} /><div className="emergency-stats"><StatCard label="Total requests" value="12" note="Today" icon={Siren} tone="red" /><StatCard label="Pending review" value="3" note="Needs action" icon={Clock3} tone="amber" /><StatCard label="Ambulances available" value="7 / 10" note="3 dispatched" icon={Ambulance} tone="green" /><StatCard label="Resolved cases" value="9" note="Today" icon={Check} tone="blue" /></div><div className="dashboard-grid emergency-grid"><section className="panel priority-panel"><div className="panel-heading"><div><span className="eyebrow">Priority queue</span><h3>Requests needing action</h3></div><button className="text-button" onClick={() => navigate('/emergency/requests')}>Open queue <ArrowRight size={15} /></button></div><div className="priority-request"><span className="priority-icon"><Siren size={19} /></span><div><strong>REQ-2048 · Eleanor Wright</strong><span>Elevated heart rate · North district</span></div><StatusPill tone="red">Critical</StatusPill><button className="icon-button" onClick={() => navigate('/emergency/requests/2048')}><ChevronRight size={17} /></button></div><div className="priority-request"><span className="priority-icon amber"><AlertTriangle size={19} /></span><div><strong>REQ-2047 · Samuel Ortiz</strong><span>Fall detected · West district</span></div><StatusPill tone="amber">Urgent</StatusPill><button className="icon-button"><ChevronRight size={17} /></button></div></section><section className="panel dispatch-panel"><div className="panel-heading"><div><span className="eyebrow">Fleet status</span><h3>Ambulances</h3></div><Ambulance size={18} className="muted-icon" /></div><div className="fleet-map"><div className="map-grid" /><span className="map-pin pin-one"><Ambulance size={14} /></span><span className="map-pin pin-two"><Ambulance size={14} /></span><span className="map-pin pin-three"><Ambulance size={14} /></span><div className="map-caption"><strong>7 available</strong><span>Across 3 districts</span></div></div></section></div></> }

function EmergencyModal({ close }: { close: () => void }) { const [sent, setSent] = useState(false); return <div className="modal-backdrop"><div className="modal-card">{sent ? <><div className="modal-success"><span><Check size={25} /></span><h2>Request received</h2><p>This is a simulated emergency request. No ambulance has been dispatched.</p><button className="button button-primary" onClick={close}>Return to dashboard</button></div></> : <><button className="modal-close" onClick={close}><X size={20} /></button><span className="modal-danger-icon"><Siren size={24} /></span><span className="eyebrow">Emergency assistance</span><h2>Do you need urgent help?</h2><p>Confirming will create a simulated request for the response team to review. This prototype does not contact emergency services.</p><div className="modal-actions"><button className="button button-ghost" onClick={close}>Cancel</button><button className="button button-danger" onClick={() => setSent(true)}>Confirm request <Siren size={16} /></button></div></>}</div></div> }

window.addEventListener('popstate', () => window.location.reload())

createRoot(document.querySelector<HTMLDivElement>('#app')!).render(<App />)
