import { useEffect, useState, type FormEvent } from 'react'
import { UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { errorMessage } from './api'
import { citizenApi, type Citizen, type Profile } from './citizen-api'
import { useCitizen } from './citizen-context'
import { Notice, PageHeader, Progress } from './components'

export function profileProgress(citizen: Citizen) {
  const p = citizen.profile
  const core = [
    ['First name', p.first_name], ['Surname', p.surname], ['Date of birth or age', p.date_of_birth || p.age !== null],
    ['Mobile number', citizen.mobile], ['Email address', citizen.email], ['State', p.state], ['District', p.district],
    ['PIN code', p.pin_code], ['Occupation or employment status', p.occupation || p.employment],
  ] as const
  const missing = core.filter(([, value]) => !value).map(([label]) => label)
  return { missing, percentage: Math.round((core.length - missing.length) * 100 / core.length) }
}

export function useProfilePhoto(hasPhoto: boolean, revision: number) {
  const [photo, setPhoto] = useState<{ revision: number; url: string }>()
  useEffect(() => {
    if (!hasPhoto) return
    const controller = new AbortController()
    let url: string | undefined
    void citizenApi.photo(controller.signal).then(blob => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(blob)
      setPhoto({ revision, url })
    }).catch(() => { /* The default avatar remains available. */ })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [hasPhoto, revision])
  return hasPhoto && photo?.revision === revision ? photo.url : undefined
}

export function Avatar({ source, size = 20 }: { source?: string; size?: number }) {
  return source ? <img className="citizen-avatar" src={source} alt="" /> : <UserRound size={size} aria-hidden="true" />
}

export async function fileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return btoa(binary)
}

export function CitizenProfile() {
  const { citizen, setCitizen, photoVersion, photoChanged } = useCitizen()
  const [preview, setPreview] = useState<{ file: File; url: string }>()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const source = useProfilePhoto(citizen.has_photo, photoVersion)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  const progress = profileProgress(citizen)

  async function changePhoto(remove = false) {
    setBusy(true)
    setStatus('')
    try {
      if (remove) await citizenApi.removePhoto()
      else if (preview) await citizenApi.savePhoto(preview.file.name, preview.file.type as 'image/jpeg' | 'image/png', await fileBase64(preview.file))
      setCitizen({ ...citizen, has_photo: !remove })
      photoChanged()
      setPreview(undefined)
      setStatus(remove ? 'Profile photo removed.' : 'Profile photo saved.')
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false) }
  }

  return <div className="page-stack">
    <PageHeader title="My Profile" description={citizen.name} icon={<UserRound size={22} />} />
    <section className="card panel section-stack">
      <div className="profile-portrait"><Avatar source={preview?.url ?? source} size={42} /></div>
      <h2>Profile photo</h2><p>{citizen.email} · {citizen.mobile}</p>
      <label>Choose a JPEG or PNG up to 1 MB<input type="file" accept="image/jpeg,image/png" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        setStatus('')
        if (!file) return
        if (!['image/jpeg', 'image/png'].includes(file.type) || !file.size || file.size > 1024 * 1024) {
          setStatus('Choose a JPEG or PNG up to 1 MB.')
          return
        }
        setPreview({ file, url: URL.createObjectURL(file) })
      }} /></label>
      <div className="button-row">
        {preview && <><button type="button" className="button button-primary" disabled={busy} onClick={() => void changePhoto()}>Save photo</button><button type="button" className="button button-outline" disabled={busy} onClick={() => setPreview(undefined)}>Cancel preview</button></>}
        {citizen.has_photo && <button type="button" className="button button-outline" disabled={busy} onClick={() => void changePhoto(true)}>Remove photo</button>}
      </div>
      {status && <p role="status">{status}</p>}
    </section>
    <section className="card panel section-stack"><h2>Profile completion</h2><p>{progress.percentage}% of basic details filled</p><Progress value={progress.percentage} label="Basic profile completion" />
      <Link className="button button-outline" to="/dashboard/required-details">Review required details</Link></section>
  </div>
}

type TextField = readonly [keyof Profile, string, number?]
const personal: TextField[] = [['first_name', 'First name'], ['middle_name', 'Middle name (optional)'], ['surname', 'Surname'], ['nationality', 'Nationality'], ['gender', 'Gender'], ['parent_name', 'Parent’s name', 120], ['guardian_name', 'Guardian’s name', 120], ['marital_status', 'Marital status']]
const address: TextField[] = [['state', 'State'], ['district', 'District'], ['taluk', 'Taluk'], ['city', 'Village or city']]
const scheme: TextField[] = [['occupation', 'Occupation'], ['parent_occupation', 'Parent’s occupation'], ['education', 'Education qualification'], ['income_range', 'Income range (optional)']]
const optionalFacts = [
  ['student', 'Student status'], ['farmer', 'Farmer status'], ['landholding', 'Landholding farmer family'],
  ['gruha_lakshmi_household_head', 'Woman listed as head of household on an applicable ration card'],
  ['disability', 'Disability-related eligibility'],
] as const

const dobAge = (value: string) => {
  if (!value) return null
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts()
  const when = Object.fromEntries(today.map(part => [part.type, part.value]))
  return Number(when.year) - Number(value.slice(0, 4)) - Number(value.slice(5) > when.month + '-' + when.day)
}

export function CitizenRequiredDetails() {
  const { citizen } = useCitizen()
  const progress = profileProgress(citizen)
  return <div className="page-stack">
    <PageHeader title="Required Details" description="Build your private profile for service preparation." icon={<UserRound size={22} />} />
    <section className="card panel section-stack"><h2>Basic profile completion</h2><p>{progress.percentage}% complete</p><Progress value={progress.percentage} label="Basic profile completion" />
      <h3>Missing information</h3>{progress.missing.length ? <ul>{progress.missing.map(label => <li key={label}>{label}</li>)}</ul> : <p>Your basic profile is complete.</p>}
      <p>Optional scheme information does not affect this score.</p>
    </section>
    <ProfileFields />
  </div>
}

function ProfileFields() {
  const { citizen, setCitizen, refreshWallet } = useCitizen()
  const profile = citizen.profile
  const [dob, setDob] = useState(profile.date_of_birth ?? '')
  const [same, setSame] = useState(profile.same_as_permanent)
  const [selectedScheme, setScheme] = useState(profile.sensitive_scheme)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const textFields = (fields: TextField[]) => fields.map(([key, label, max]) =>
    <label key={key}>{label}<input name={key} defaultValue={String(profile[key] ?? '')} maxLength={max ?? 60} /></label>,
  )
  const select = (name: keyof Profile, label: string, options: string[]) => <label>{label}
    <select name={name} defaultValue={String(profile[name] ?? '')}><option value="">Prefer not to say</option>{options.map(option => <option key={option}>{option}</option>)}</select>
  </label>

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const read = (key: string) => String(values.get(key) ?? '').trim()
    const next = { ...profile }
    for (const [key] of [...personal, ...address, ...scheme]) Object.assign(next, { [key]: read(key) })
    for (const key of ['title', 'area', 'employment', 'pin_code', 'temporary_address', 'permanent_address', 'ration_status', 'religion', 'caste', 'reservation_category', 'sensitive_scheme'] as const) next[key] = read(key)
    for (const [key] of optionalFacts) next[key] = read(key) ? read(key) === 'yes' : null
    next.date_of_birth = dob || null
    next.age = dob ? null : read('age') ? Number(read('age')) : null
    next.annual_household_income = read('annual_household_income') ? Number(read('annual_household_income')) : null
    next.same_as_permanent = same
    next.dependent = read('dependent') ? { label: read('dependent'), education: read('dependent-education'), consent: true } : null
    if (next.dependent && !values.has('guardian-consent')) { setStatus('Confirm that you are authorized to share the optional dependent information.'); return }
    const contacts = { email: read('email'), mobile: read('mobile') }
    const changed = contacts.email !== citizen.email || contacts.mobile !== citizen.mobile
    if (changed && !read('current-password')) { setStatus('Enter your password to change your sign-in contact details.'); return }
    setBusy(true)
    try {
      setCitizen(await citizenApi.updateProfile(next, changed ? { ...contacts, password: String(values.get('current-password')) } : undefined))
      const passwordInput = form.elements.namedItem('current-password')
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = ''
      if (changed) refreshWallet()
      setStatus('Profile changes saved.')
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false) }
  }

  const age = dobAge(dob)
  return <form className="card panel section-stack" onSubmit={save}>
    <fieldset className="section-stack"><legend>Personal information</legend><div className="citizen-two">
      {select('title', 'Title', ['Mr', 'Mrs', 'Ms', 'Other'])}{textFields(personal)}
      <label>Date of birth<input type="date" value={dob} onChange={event => setDob(event.target.value)} /></label>
      {dob ? <label>Calculated age<input value={age === null || age < 0 || age > 125 ? 'Check date of birth' : String(age)} readOnly /></label>
        : <label>Age (optional alternative to date of birth)<input type="number" name="age" min="0" max="125" defaultValue={profile.age ?? ''} /></label>}
      <label>Mobile number<input name="mobile" type="tel" autoComplete="tel" required maxLength={24} defaultValue={citizen.mobile} /></label>
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={citizen.email} /></label>
      <label>Current password (for contact changes)<input name="current-password" type="password" autoComplete="current-password" maxLength={128} /></label>
    </div></fieldset>
    <fieldset className="section-stack"><legend>Address information</legend><div className="citizen-two">
      {textFields(address)}<label>PIN code<input name="pin_code" inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} defaultValue={profile.pin_code} /></label>
      {select('area', 'Area', ['Urban', 'Rural'])}
      <label>Permanent address<textarea name="permanent_address" maxLength={240} defaultValue={profile.permanent_address} /></label>
      <label>Temporary address<textarea name="temporary_address" maxLength={240} defaultValue={profile.temporary_address} disabled={same} /></label>
    </div><label className="inline-check"><input type="checkbox" checked={same} onChange={event => setSame(event.target.checked)} /> Temporary address is the same as permanent address</label></fieldset>
    <fieldset className="section-stack"><legend>Optional scheme information</legend>
      <Notice>Share only the facts relevant to your service. You can clear any optional value and save again. Do not enter identity or account numbers in these fields.</Notice>
      <div className="citizen-two">{textFields(scheme)}
        {select('employment', 'Current work or study status', ['Student', 'Farmer', 'Employee', 'Self-employed', 'Unemployed', 'Retired'])}
        {select('ration_status', 'Household ration status', ['BPL', 'APL'])}
        <label>Annual household income in rupees<input name="annual_household_income" type="number" min={0} max={1000000000} defaultValue={profile.annual_household_income ?? ''} /></label>
        {optionalFacts.map(([key, label]) => <label key={key}>{label}<select name={key} defaultValue={profile[key] === null ? '' : profile[key] ? 'yes' : 'no'}><option value="">Prefer not to share</option><option value="yes">Yes</option><option value="no">No</option></select></label>)}
      </div>
      <label>Programme for optional community details<select name="sensitive_scheme" value={selectedScheme} onChange={event => setScheme(event.target.value)}><option value="">Do not share</option><option value="ssp-post-matric-scholarship">SSP Post-Matric Scholarship</option><option value="vidyasiri">Vidyasiri</option></select></label>
      {selectedScheme && <><p>Some awards limit access to specified communities or reserved categories. Only provide the field your particular award requires.</p><div className="citizen-two">
        {textFields([['caste', 'Caste'], ['reservation_category', 'Reservation category']])}
        {selectedScheme === 'ssp-post-matric-scholarship' && textFields([['religion', 'Religion (minority awards only)']])}
      </div></>}
    </fieldset>
    <fieldset className="section-stack"><legend>Optional dependent profile</legend><div className="citizen-two">
      <label>Dependent nickname<input name="dependent" maxLength={60} defaultValue={profile.dependent?.label} /></label>
      <label>Dependent education<input name="dependent-education" maxLength={60} defaultValue={profile.dependent?.education} /></label>
    </div><label className="inline-check"><input type="checkbox" name="guardian-consent" defaultChecked={!!profile.dependent} /> I am authorized to share this dependent information.</label></fieldset>
    <label className="inline-check"><input type="checkbox" required /> I agree to save these details to my private account.</label>
    <div className="button-row"><button className="button button-primary" disabled={busy}>Save Changes</button><Link className="button button-outline" to="/dashboard/profile">Cancel</Link></div>
    {status && <p role="status">{status}</p>}
  </form>
}
