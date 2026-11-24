import { AlertTriangle, ArrowRight, Check, ChevronRight, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { Account, StoredState } from './db'

type Props = {
  database: StoredState
  updateDatabase: (database: StoredState) => void
  onBack: () => void
  onCreated: () => void
  allowPatient: boolean
}

export function CreateAccountForm({ database, updateDatabase, onBack, onCreated, allowPatient }: Props) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
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
    setError('')
    if (database.accounts.some((account) => account.email.toLowerCase() === email.toLowerCase())) {
      setError('An account already exists for that email address.')
      return
    }
    const titles: Record<Account['role'], string> = {
      patient: 'Patient account', admin: 'Family administrator', doctor: 'Clinical professional', emergency: 'Health Support',
    }
    const account: Account = {
      email, password, phone, role, name, title: titles[role], dateOfBirth, profession, address,
      access: role === 'doctor' || role === 'emergency' ? 'pending' : 'active',
    }
    updateDatabase({ ...database, accounts: [...database.accounts, account] })
    setCreated(true)
  }

  if (created) {
    const needsApproval = role === 'doctor' || role === 'emergency'
    return <div className="register-success"><span><Check size={23} /></span><h2>{needsApproval ? 'Approval requested' : 'Account created'}</h2><p>{needsApproval ? 'This account is saved, but special permission is required before it can sign in.' : 'The new account is ready to use.'}</p><button className="button button-primary button-wide" onClick={onCreated}>Continue <ArrowRight size={17} /></button></div>
  }

  return <div className="login-page">
    <button className="login-back" onClick={onBack}><ChevronRight size={16} className="rotate-back" /> Back</button>
    <div className="register-layout">
      <div className="register-intro">
        <span className="eyebrow">{allowPatient ? 'Administrator workspace' : 'Account registration'}</span>
        <h1>{allowPatient ? <>Add a new<br /><em>member.</em></> : <>Create your<br /><em>account.</em></>}</h1>
        <p>{allowPatient ? 'Add as many authorised people as your care circle needs.' : 'Use this form to request access to the VITALYX care platform.'}</p>
        <div className="notice-banner"><ShieldCheck size={18} /><span>Doctor and Health Support accounts require approval before login.</span></div>
      </div>
      <div className="login-card">
        <div className="card-kicker">Account details</div>
        <h2>{allowPatient ? 'Add member' : 'Create account'}</h2>
        <p className="muted">Complete the details below.</p>
        <form onSubmit={submit}>
          <label>Mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
          <label>Name<input type="text" value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Date of birth<input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required /></label>
          <label>Address<input type="text" value={address} onChange={(event) => setAddress(event.target.value)} required /></label>
          <label>Profession<input type="text" value={profession} onChange={(event) => setProfession(event.target.value)} required /></label>
          <label>Login as<select className="role-select" value={role} onChange={(event) => setRole(event.target.value as Account['role'])}>{allowPatient && <option value="patient">Patient</option>}<option value="admin">Admin</option><option value="doctor">Doctor</option><option value="emergency">Health Support</option></select></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></label>
          {error && <div className="form-error"><AlertTriangle size={15} />{error}</div>}
          <button className="button button-primary button-wide" type="submit">Create account <ArrowRight size={17} /></button>
        </form>
      </div>
    </div>
  </div>
}
