import { useState, type FormEvent, type ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Link } from 'react-router'
import { errorMessage } from './api'
import { citizenApi, type CitizenDocument } from './citizen-api'
import { useCitizen } from './citizen-context'
import { ConnectionError, Loading, Notice } from './components'

export function WalletGate({ children }: { children: ReactNode }) {
  const { wallet, walletOpen, refreshWallet } = useCitizen()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const credential = String(new FormData(form).get('credential') ?? '')
    form.reset()
    setBusy(true)
    setStatus('')
    try { await citizenApi.unlock(credential); refreshWallet() }
    catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false) }
  }

  if (walletOpen) return children
  if (wallet.loading) return <Loading />
  if (wallet.error != null) return <ConnectionError error={wallet.error} retry={wallet.retry} />
  const usesPin = wallet.data?.uses_mpin
  return <form className="card panel section-stack" onSubmit={unlock}>
    <span className="tile-icon"><LockKeyhole size={20} /></span><h2>Unlock document wallet</h2>
    <p>Enter your {usesPin ? 'six-digit MPIN' : 'account password'} to view your private files. The wallet locks again after five minutes.</p>
    <label>{usesPin ? 'MPIN' : 'Account password'}<input name="credential" type="password" inputMode={usesPin ? 'numeric' : undefined} pattern={usesPin ? '[0-9]{6}' : undefined} maxLength={usesPin ? 6 : 128} autoComplete={usesPin ? 'off' : 'current-password'} required /></label>
    <div className="button-row"><button className="button button-primary" disabled={busy}>Unlock wallet</button><Link className="text-link" to="/dashboard/settings">Wallet settings</Link></div>
    {status && <p role="alert">{status}</p>}
  </form>
}

export function WalletLockedNotice() {
  return <Notice>Unlock your wallet to compare private uploads. <Link className="text-link" to="/dashboard/documents">Open document wallet</Link></Notice>
}

export function expiryDays(expiresOn: string | null) {
  if (!expiresOn) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts()
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return Math.round((Date.parse(expiresOn) - Date.parse(date.year + '-' + date.month + '-' + date.day)) / 86_400_000)
}

export function expiryLabel(expiresOn: string | null) {
  const days = expiryDays(expiresOn)
  return days === null || days > 30 ? 'Uploaded' : days < 0 ? 'Expired' : 'Expiring soon'
}

const renewalPortals: Partial<Record<CitizenDocument['category'], [string, string]>> = {
  'Aadhaar Card': ['UIDAI', 'https://uidai.gov.in/'],
  'Driving Licence': ['Sarathi', 'https://sarathi.parivahan.gov.in/sarathiservice/'],
  'Ration card': ['National Food Security Portal for Karnataka', 'https://nfsa.gov.in/State/KA'],
  'Income certificate': ['Tumakuru district income certificate guidance', 'https://tumkur.nic.in/en/service/apply-for-income-certificate/'],
  'Caste certificate': ['Karnataka Seva Sindhu', 'https://sevasindhu.karnataka.gov.in/Sevasindhu/English'],
  'Combined Caste and Income Certificate': ['Karnataka Seva Sindhu', 'https://sevasindhu.karnataka.gov.in/Sevasindhu/English'],
}

export function Renewal({ category }: { category: CitizenDocument['category'] }) {
  const portal = renewalPortals[category]
  return <p>Ask the issuer which renewal or replacement process applies, then replace the file and update the expiry date in your wallet.
    {portal && <> <a className="text-link" href={portal[1]} target="_blank" rel="noreferrer">{portal[0]}</a></>}
  </p>
}
