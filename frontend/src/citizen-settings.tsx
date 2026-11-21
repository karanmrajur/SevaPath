import { useState, type FormEvent } from 'react'
import { Settings } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { errorMessage } from './api'
import { citizenApi } from './citizen-api'
import { useCitizen } from './citizen-context'
import { Notice, PageHeader } from './components'
import { usePortalPreferences } from './portal-preferences'

export function CitizenSettings() {
  const { citizen, setCitizen, wallet, walletOpen, refreshWallet, inventoryChanged } = useCitizen()
  const { language, setLanguage } = usePortalPreferences()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [removePin, setRemovePin] = useState(false)

  async function perform(event: FormEvent<HTMLFormElement>, section: string, work: (fields: FormData) => Promise<string>, clear = false) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    setBusy(section)
    setStatus(current => ({ ...current, [section]: '' }))
    try {
      const message = await work(fields)
      setStatus(current => ({ ...current, [section]: message }))
      if (clear) form.reset()
    } catch (error) { setStatus(current => ({ ...current, [section]: errorMessage(error) })) }
    finally { setBusy('') }
  }

  const password = (fields: FormData) => String(fields.get('password') ?? '')
  const feedback = (section: string) => status[section] && <p role="status">{status[section]}</p>

  return <div className="page-stack">
    <PageHeader title="Settings" description="Manage your account, privacy and document wallet." icon={<Settings size={22} />} />
    <section className="card panel button-row">
      <Link className="button button-outline" to="/dashboard/required-details">Edit profile</Link>
      <Link className="button button-outline" to="/dashboard/documents">Manage documents</Link>
      <Link className="button button-outline" to="/dashboard/privacy">Privacy controls and account deletion</Link>
    </section>
    <div className="citizen-two">
      <form className="card panel section-stack" onSubmit={event => void perform(event, 'preferences', async fields => {
        const nextLanguage = fields.get('language') === 'hi' ? 'hi' : 'en'
        setCitizen(await citizenApi.updateSettings({ language: nextLanguage, notifications: fields.has('notifications'), expiry_alerts: fields.has('expiry') }))
        setLanguage(nextLanguage)
        inventoryChanged()
        return 'Preferences saved.'
      })}>
        <h2>Language and notifications</h2>
        <label>Preferred language<select name="language" defaultValue={citizen.settings.language ?? language}><option value="en">English</option><option value="hi">हिन्दी</option></select></label>
        <label className="inline-check"><input type="checkbox" name="notifications" defaultChecked={citizen.settings.notifications} /> Show dashboard notifications</label>
        <label className="inline-check"><input type="checkbox" name="expiry" defaultChecked={citizen.settings.expiry_alerts} /> Show 30-, 15- and 7-day document reminders</label>
        <p>Document reminders appear in the unlocked wallet. Delivery by email or SMS is unavailable.</p>
        <button className="button button-primary" disabled={!!busy}>Save preferences</button>{feedback('preferences')}
      </form>
      <form className="card panel section-stack" onSubmit={event => void perform(event, 'wallet', async fields => {
        await citizenApi.mpin(password(fields), removePin ? null : String(fields.get('mpin') ?? ''))
        setRemovePin(false)
        refreshWallet()
        return 'Wallet credential updated. Unlock the wallet again to use it.'
      }, true)}>
        <h2>Wallet unlock</h2>
        <p>{wallet.data?.uses_mpin ? 'A six-digit MPIN is set.' : 'Your account password unlocks the wallet.'}</p>
        <label>Current account password<input name="password" type="password" autoComplete="current-password" maxLength={128} required /></label>
        {wallet.data?.uses_mpin && <label className="inline-check"><input type="checkbox" checked={removePin} onChange={event => setRemovePin(event.target.checked)} /> Remove MPIN and use account password</label>}
        {!removePin && <label>New six-digit MPIN<input name="mpin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" required /></label>}
        <button className="button button-primary" disabled={!!busy}>{removePin ? 'Remove MPIN' : wallet.data?.uses_mpin ? 'Change MPIN' : 'Set MPIN'}</button>{feedback('wallet')}
      </form>
      <form className="card panel section-stack" onSubmit={event => void perform(event, 'password', async fields => {
        const newPassword = String(fields.get('new-password') ?? '')
        if (newPassword !== fields.get('confirm')) throw new Error('The new passwords do not match.')
        await citizenApi.changePassword(password(fields), newPassword)
        navigate('/login', { replace: true })
        return ''
      }, true)}>
        <h2>Change password</h2><p>After changing your password, sign in again on every device.</p>
        <label>Current password<input name="password" type="password" autoComplete="current-password" maxLength={128} required /></label>
        <label>New password<input name="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <button className="button button-primary" disabled={!!busy}>Change password</button>{feedback('password')}
      </form>
      <form className="card panel section-stack" onSubmit={event => void perform(event, 'export', async fields => {
        const data = await citizenApi.exportData(password(fields))
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = 'sevapath-personal-data.json'
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        return 'Your account data download was prepared.'
      }, true)}>
        <h2>Download personal data</h2><p>Export your profile, workspace records, drafts and file details. Download individual files in My Documents.</p>
        {!walletOpen && <Notice><Link className="text-link" to="/dashboard/documents">Unlock your wallet</Link> before exporting your data.</Notice>}
        <label>Current account password<input name="password" type="password" autoComplete="current-password" maxLength={128} required disabled={!walletOpen} /></label>
        <button className="button button-outline" disabled={!!busy || !walletOpen}>Download personal data</button>{feedback('export')}
      </form>
    </div>
  </div>
}
