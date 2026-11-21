import { useState, type FormEvent } from 'react'
import { FileText, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { errorMessage } from './api'
import { citizenApi } from './citizen-api'
import { Notice, PageHeader } from './components'

export function CitizenTerms() {
  return <div className="page-stack">
    <PageHeader title="Terms of Service" description="How to use the SevaPath workspace." icon={<FileText size={22} />} />
    <article className="card panel section-stack"><h2>Independent citizen assistance</h2><p>SevaPath is an independent citizen-assistance project. The relevant government agency sets requirements and makes application decisions.</p><h2>Using preparation and tracking tools</h2><p>Check dates, eligibility, fees and official application status with the agency. Personal tracking entries are user reported. Submit applications and complaints through authorized portals.</p><Link className="text-link" to="/dashboard/privacy">Read the privacy policy</Link></article>
  </div>
}

export function CitizenPrivacy() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const password = String(new FormData(form).get('password') ?? '')
    setBusy(true); setStatus('')
    try { await citizenApi.deleteAccount(password); form.reset(); navigate('/', { replace: true }) }
    catch (error) { setStatus(errorMessage(error)); setBusy(false) }
  }

  return <div className="page-stack">
    <PageHeader title="Privacy Policy" description="See what the workspace stores and how to delete it." icon={<ShieldCheck size={22} />} />
    <article className="card panel section-stack"><h2>Account data</h2><p>SevaPath stores your account details, a password hash, optional profile, saved services, recent service selections and your private preparation records. New document files and profile photos are encrypted in the server database. The wallet requires a separate, five-minute unlock and checks ownership on every request. You can download account data through Settings.</p>
      <h2>Browser and session data</h2><p>An HttpOnly session cookie identifies your login. Sessions expire after eight hours, or after fourteen days if you choose Remember me. The browser stores interface preferences and any separate public workspace checklist. Voice input may be handled by your browser speech provider.</p>
      <h2>Retention and deletion</h2><p>Account records remain in the application database until you delete your account. Deleting it removes active records, uploads, and account sessions. Separate anonymous browser data and infrastructure backups follow their own storage lifecycle. Infrastructure backups require a deployment retention policy.</p></article>
    <form className="card panel section-stack" method="post" onSubmit={remove}><h2>Delete your account and data</h2><Notice>This permanently deletes your citizen account, private documents, preparation journeys, and drafts.</Notice>
      <label>Confirm your password<input name="password" type="password" maxLength={128} autoComplete="current-password" required /></label>
      <label className="inline-check"><input type="checkbox" required /> I understand that my account data will be permanently deleted.</label>
      <button className="button button-danger" disabled={busy}>Delete account and data</button>{status && <p role="alert">{status}</p>}
    </form>
  </div>
}
