import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BookOpen, Download, ExternalLink, FileCheck2, GitFork, MessageSquareText, Upload } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, errorMessage, type Journey } from './api'
import { ApplicationFacts } from './catalogue-evidence'
import { expiryLabel, Renewal, WalletGate, WalletLockedNotice } from './citizen-wallet'
import { applicationStatuses, citizenApi, documentCategories, grievanceStatuses, preparationTasks, type Application, type CitizenDocument } from './citizen-api'
import { toggleItem, useCitizen } from './citizen-context'
import { ConnectionError, EmptyState, Loading, Notice, PageHeader, PortalLink, Progress, StatusBadge } from './components'
import { useApi } from './use-api'
import { scanTypes } from './document-scan-engine'
import { GrievanceCopilot } from './grievance-copilot'

const OFFICIAL_GRIEVANCES = 'https://pgportal.gov.in/'

function useSelectedService() {
  const [params, setParams] = useSearchParams()
  const { catalogue } = useCitizen()
  const slug = params.get('service') ?? ''
  return {
    slug, services: catalogue.data ?? [], service: catalogue.data?.find(item => item.slug === slug),
    select: (value: string) => setParams(value ? { service: value } : {}),
  }
}

function ServicePicker({ selection }: { selection: ReturnType<typeof useSelectedService> }) {
  const { catalogue } = useCitizen()
  if (catalogue.loading) return <Loading />
  if (catalogue.error != null) return <ConnectionError error={catalogue.error} retry={catalogue.retry} />
  return <label>Service<select value={selection.slug} onChange={event => selection.select(event.target.value)}>
    <option value="">Choose a service</option>
    {selection.services.map(service => <option key={service.slug} value={service.slug}>{service.name}</option>)}
  </select></label>
}

export function CitizenChecklist({ slug }: { slug: string }) {
  const result = useApi(api.serviceDocuments, slug)
  const { workspace, saving, save, walletOpen, inventoryVersion } = useCitizen()
  const inventory = useApi(citizenApi.readiness, slug, walletOpen, inventoryVersion)
  if (result.loading || workspace.loading) return <Loading />
  if (result.error != null) return <ConnectionError error={result.error} retry={result.retry} />
  if (workspace.error != null) return <ConnectionError error={workspace.error} retry={workspace.retry} />
  if (!result.data?.items.length) return <p>Verified document requirements are unavailable for this service. Check its official portal.</p>
  const required = result.data.items.filter(item => item.required_status === 'required')
  const ready = required.filter(item => workspace.data?.checklist[slug + '-' + item.id] === 'ready').length
  return <div className="section-stack">
    {!walletOpen && <WalletLockedNotice />}
    {inventory.loading && <Loading />}
    {inventory.error != null && <ConnectionError error={inventory.error} retry={inventory.retry} />}
    {inventory.data && <><p>Uploaded document readiness: {inventory.data.percentage === null ? 'Not available' : inventory.data.percentage + '%'}</p><p className="metadata">Matches use the category and any expiry date you entered.</p></>}
    <Link className="text-link" to={'/dashboard/documents?' + new URLSearchParams({ service: slug }) + '#document-upload'}>Upload or update documents</Link>
    {required.length > 0 && <><p>{ready} of {required.length} required documents marked ready</p><Progress value={100 * ready / required.length} label="Documents marked ready" /></>}
    {result.data.items.map(item => {
      const key = slug + '-' + item.id
      const match = inventory.data?.items.find(row => row.requirement.id === item.id)
      return <div className="citizen-check-row" key={item.id}>
        <div><strong>{item.document_name}</strong> <StatusBadge>{item.required_status}</StatusBadge>{match && <p>{({ uploaded: 'Uploaded', expired: 'Expired', missing: 'Missing from inventory', unmapped: 'Check manually' })[match.status]}{match.files.length > 0 && ' · ' + match.files.map(file => file.expires_on ? file.name + ' (expiry ' + file.expires_on + ')' : file.name).join(', ')}</p>}<p><a className="text-link" href={item.source.source_url} target="_blank" rel="noreferrer">Requirements source</a></p></div>
        <label><span className="sr-only">Readiness for {item.document_name}</span><select value={workspace.data?.checklist[key] ?? 'unchecked'} disabled={saving} onChange={event => {
          const choice = event.target.value as 'unchecked' | 'ready' | 'missing'
          void save(data => ({ ...data, checklist: { ...data.checklist, [key]: choice } }))
        }}><option value="unchecked">Not checked</option><option value="ready">Marked ready</option><option value="missing">Missing</option></select></label>
      </div>
    })}
  </div>
}

function readFile(file: File, update: (value: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = event => { if (event.lengthComputable) update(Math.round(100 * event.loaded / event.total)) }
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(file)
  })
}

export function CitizenDocuments() {
  return <div className="page-stack">
    <PageHeader title="My Documents" description="Manage private uploads, expiry dates and scheme checklists." icon={<FileCheck2 size={22} />} />
    <div className="button-row"><Link className="button button-outline" to="/dashboard/documents/scan">Scan for scheme eligibility</Link></div>
    <section className="card panel section-stack">
      <h2>Document Consistency Check</h2>
      <p>Compare reviewed scans of your documents, resolve conflicting fields, and see which scheme conditions need another look.</p>
      <div><Link className="button button-outline" to="/dashboard/documents/consistency">Open consistency check</Link></div>
    </section>
    <WalletGate><DocumentInventory /></WalletGate>
  </div>
}

function DocumentInventory() {
  const selection = useSelectedService()
  const { wallet, refreshWallet, inventoryVersion, inventoryChanged, setWalletScan } = useCitizen()
  const navigate = useNavigate()
  const files = useApi(citizenApi.documents, '', true, inventoryVersion)
  const alerts = useApi(citizenApi.expiry, '', true, inventoryVersion)
  const selectedReadiness = useApi(citizenApi.readiness, selection.slug, !!selection.service, inventoryVersion)
  const opening = useRef<AbortController>(undefined)
  const [replacing, setReplacing] = useState<CitizenDocument>()
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string }>()
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<number | null>()
  const [notice, setNotice] = useState('')
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  useEffect(() => () => opening.current?.abort(), [])

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const file = values.get('file')
    setNotice('')
    if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024
      || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      setNotice('Choose a PDF, JPEG or PNG up to 3 MB.')
      return
    }
    setBusy(true)
    setStage(0)
    try {
      const content = await readFile(file, setStage)
      setStage(null)
      const saved = await citizenApi.upload({
        name: file.name, mime: file.type as CitizenDocument['mime'],
        category: values.get('category') as CitizenDocument['category'], content,
        expires_on: String(values.get('expires_on') || '') || null,
      }, replacing?.id)
      setReplacing(undefined)
      setPreview(undefined)
      form.reset()
      inventoryChanged()
      setNotice('Private document saved.')
      if (replacing || (saved.mime !== 'application/pdf' && scanTypes.some(type => type === saved.category))) {
        reviewWalletDocument(saved)
      }
    } catch (error) { setNotice(errorMessage(error)) }
    finally { setBusy(false); setStage(undefined) }
  }

  function reviewWalletDocument(item: CitizenDocument) {
    setWalletScan({ id: item.id, category: item.category, mime: item.mime })
    navigate('/dashboard/documents/consistency')
  }

  async function open(item: CitizenDocument) {
    setNotice('')
    opening.current?.abort()
    const controller = new AbortController()
    opening.current = controller
    try {
      const blob = await citizenApi.documentBlob(item.id, controller.signal)
      if (!controller.signal.aborted) setPreview({ url: URL.createObjectURL(blob), name: item.name, mime: item.mime })
    } catch (error) { if (!controller.signal.aborted) setNotice(errorMessage(error)) }
  }

  async function remove(item: CitizenDocument) {
    if (!window.confirm('Permanently delete this private document?')) return
    setBusy(true)
    try { await citizenApi.deleteDocument(item.id); setPreview(undefined); inventoryChanged(); setNotice('Private document deleted.') }
    catch (error) { setNotice(errorMessage(error)) }
    finally { setBusy(false) }
  }

  return <div className="page-stack">
    <div className="button-row"><button className="button button-outline" type="button" onClick={async () => {
      try { await citizenApi.lock(); refreshWallet() } catch (error) { setNotice(errorMessage(error)) }
    }}>Lock wallet</button><Link className="text-link" to="/dashboard/settings">Wallet settings</Link></div>
    <Notice>File categories and expiry dates are supplied by you. Confirm document acceptance with the issuer.</Notice>
    {!wallet.data?.encrypted_storage && <Notice>Encrypted storage needs server configuration before you can upload or replace a file.</Notice>}
    <section className="card panel section-stack"><h2>Expiring Soon</h2>
      {alerts.loading && <Loading />}{alerts.error != null && <ConnectionError error={alerts.error} retry={alerts.retry} />}
      {alerts.data && (alerts.data.length ? <ul className="section-stack">{alerts.data.map(alert => <li key={alert.document.id}>
        <strong>{alert.document.name}</strong> · {alert.days_left === 0 ? 'Expires today' : alert.days_left + ' days left'} · {alert.milestone}-day reminder
        <Renewal category={alert.document.category} />
      </li>)}</ul> : <p>No expiry reminders to show. <Link className="text-link" to="/dashboard/settings">Manage alerts</Link></p>)}
    </section>
    <div className="citizen-two">
      <form id="document-upload" key={replacing?.id ?? 'new'} className="card panel section-stack" onSubmit={upload}>
        <h2>{replacing ? 'Replace ' + replacing.name : 'Upload a document'}</h2>
        <label>Document category<select name="category" defaultValue={replacing?.category ?? 'Other'}>{documentCategories.map(category => <option key={category} value={category}>{category === 'Ration card' ? 'Ration Card (BPL / APL)' : category === 'Other' ? 'Other Documents' : category}</option>)}</select></label>
        <label>Expiry date (optional)<input name="expires_on" type="date" defaultValue={replacing?.expires_on ?? ''} /></label>
        <label>Choose PDF, JPEG or PNG<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required /></label>
        <label className="inline-check"><input type="checkbox" required /> Store this file in my private account.</label>
        <p className="metadata">Supported images open the local consistency review after saving. To scan without storing the file in your account, open Document Consistency Check above.</p>
        {stage !== undefined && <progress className="progress" value={stage ?? undefined} max={100} aria-label={stage === null ? 'Uploading document' : 'Reading document'} />}
        <div className="button-row"><button className="button button-primary" disabled={busy || !wallet.data?.encrypted_storage}><Upload size={16} />{replacing ? 'Replace document' : 'Upload document'}</button>
          {replacing && <button type="button" className="button button-outline" onClick={() => setReplacing(undefined)} disabled={busy}>Cancel</button>}</div>
        {notice && <p role="status">{notice}</p>}
      </form>
      <section className="card panel section-stack"><h2>Service readiness</h2><ServicePicker selection={selection} />{selection.service && <CitizenChecklist slug={selection.slug} />}</section>
    </div>
    <section className="card panel section-stack"><h2>Private files</h2>
      {files.loading && <Loading />}
      {files.error != null && <ConnectionError error={files.error} retry={files.retry} />}
      {files.data && (files.data.length ? files.data.map(item => <article className="citizen-record-row" key={item.id}>
        <div><h3>{item.name}</h3><p>{item.category} · {Math.ceil(item.size / 1024)} KB</p>
          <p>Uploaded {new Date(item.uploaded_at).toLocaleDateString()}{item.expires_on && ' · Expires ' + item.expires_on}</p>
          <StatusBadge tone={expiryLabel(item.expires_on) === 'Uploaded' ? 'green' : 'amber'}>{expiryLabel(item.expires_on)}</StatusBadge>
          {selection.service && selectedReadiness.data && <p>{selectedReadiness.data.items.some(row => row.requirement.required_status === 'required' && row.files.some(file => file.id === item.id))
            ? 'Matches a required document for this service' : 'No known required item matches this file'}</p>}
          {expiryLabel(item.expires_on) === 'Expired' && <Renewal category={item.category} />}
        </div>
        <div className="button-row"><button type="button" className="button button-outline" onClick={() => void open(item)}><Download size={16} />Preview</button>
          <button type="button" className="button button-outline" disabled={busy || !wallet.data?.encrypted_storage} onClick={() => { setReplacing(item); requestAnimationFrame(() => document.getElementById('document-upload')?.scrollIntoView()) }}>Replace</button>
          <button type="button" className="button button-outline" disabled={busy} onClick={() => reviewWalletDocument(item)}>Check consistency</button>
          <button type="button" className="button button-outline" disabled={busy} onClick={() => void remove(item)}>Delete</button></div>
      </article>) : <EmptyState title="No uploaded documents">Uploaded files will appear here.</EmptyState>)}
      {preview && <div className="citizen-preview"><button type="button" className="button button-outline" onClick={() => setPreview(undefined)}>Close preview</button><a className="button button-outline" href={preview.url} download={preview.name}>Download</a>{preview.mime === 'application/pdf'
        ? <iframe title={'Preview of ' + preview.name} src={preview.url} sandbox="" />
        : <img src={preview.url} alt={'Preview of ' + preview.name} />}</div>}
    </section>
  </div>
}

export function CitizenApplications() {
  const selection = useSelectedService()
  const { citizen, workspace, saving, save } = useCitizen()
  const [prefill, setPrefill] = useState('')
  const [receipt, setReceipt] = useState('')
  const current = workspace.data?.applications[selection.slug]
  const entries = Object.entries(workspace.data?.applications ?? {})
  const slug = selection.slug

  async function store(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selection.service) return
    const values = new FormData(event.currentTarget)
    const record: Application = {
      title: selection.service.name, reference: String(values.get('reference') ?? ''),
      status: values.get('status') as Application['status'], submission_date: String(values.get('date') ?? '') || null,
      applicant_name: String(values.get('applicant-name') ?? ''),
      applicant_contact: String(values.get('applicant-contact') ?? ''),
      next_step: String(values.get('next') ?? ''), tasks: preparationTasks.map((_, index) => values.has('task-' + index)),
    }
    setReceipt(await save(data => ({ ...data, applications: { ...data.applications, [slug]: record } })) ? 'Application tracking saved.' : '')
  }

  return <div className="page-stack">
    <PageHeader title="My Applications" description="Record your own preparation progress and updates received through official channels." icon={<BookOpen size={22} />} />
    <Notice>Application statuses and reference numbers here are user reported. Check the official portal for confirmed updates.</Notice>
    {workspace.loading && <Loading />}
    {workspace.error != null && <ConnectionError error={workspace.error} retry={workspace.retry} />}
    <div className="citizen-two">
      <section className="card panel section-stack"><h2>{current ? 'Edit tracking record' : 'Track an application'}</h2>
        <ServicePicker selection={selection} />
        {selection.service && workspace.data && <form key={slug} className="section-stack" onSubmit={store}>
          <p>Use your profile to fill the two local preparation fields below if you choose.</p>
          <button type="button" className="button button-outline" onClick={event => {
            const form = event.currentTarget.form
            const name = form?.elements.namedItem('applicant-name')
            const contact = form?.elements.namedItem('applicant-contact')
            if (name instanceof HTMLInputElement) name.value = citizen.name
            if (contact instanceof HTMLInputElement) contact.value = citizen.mobile
            setPrefill('Profile name and mobile number added to this draft. Review them before saving.')
          }}>Use my profile details</button>
          {prefill && <p role="status">{prefill}</p>}
          <label>Applicant name (optional)<input name="applicant-name" maxLength={120} defaultValue={current?.applicant_name} /></label>
          <label>Applicant contact (optional)<input name="applicant-contact" maxLength={120} defaultValue={current?.applicant_contact} /></label>
          <label>Application reference<input name="reference" maxLength={120} defaultValue={current?.reference} /></label>
          <label>Submission date<input name="date" type="date" defaultValue={current?.submission_date ?? ''} /></label>
          <label>User-reported status<select name="status" defaultValue={current?.status ?? 'Preparing'}>{applicationStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
          <fieldset className="section-stack"><legend>Preparation tasks</legend>{preparationTasks.map((task, index) => <label className="inline-check" key={task}><input type="checkbox" name={'task-' + index} defaultChecked={current?.tasks[index]} />{task}</label>)}</fieldset>
          <label>Next step<input name="next" defaultValue={current?.next_step} maxLength={120} /></label>
          <div className="button-row"><button className="button button-primary" disabled={saving}>Save tracking record</button><PortalLink service={selection.service} /></div>
          {receipt && <p role="status">{receipt}</p>}
        </form>}
      </section>
      <section className="card panel section-stack"><h2>Required documents</h2>{selection.service ? <CitizenChecklist slug={slug} /> : <p>Choose a service to review its sourced checklist.</p>}</section>
    </div>
    <section className="card panel section-stack"><h2>Application records</h2>{entries.length ? entries.map(([key, entry]) => {
      const done = entry.tasks.filter(Boolean).length
      return <article key={key} className="citizen-record-row">
        <div><h3>{entry.title}</h3><p>{entry.reference || 'Reference not recorded'} · {entry.submission_date ?? 'Date not recorded'}</p>
          <p>{entry.tasks.length - done} pending tasks · {entry.next_step || 'Next step not recorded'}</p></div>
        <div><StatusBadge>{entry.status} · User Reported</StatusBadge><p>{Math.round(100 * done / entry.tasks.length)}% preparation complete</p></div>
        <button type="button" className="button button-outline" onClick={() => { selection.select(key); setReceipt(''); setPrefill('') }}>Review</button>
      </article>
    }) : <EmptyState title="No application records">Select a service to track it privately.</EmptyState>}</section>
  </div>
}

function Dependencies({ slug }: { slug: string }) {
  const result = useApi(api.serviceDependencies, slug)
  if (result.loading) return <Loading />
  if (result.error != null) return <ConnectionError error={result.error} retry={result.retry} />
  if (!result.data?.items.length) return <p>No verified dependencies are published for this service.</p>
  return <ol className="citizen-flow">{result.data.items.map(item => <li key={item.id}>
    <Link className="text-link" to={'/dashboard/services/' + item.prerequisite_service.slug}>{item.prerequisite_service.name}</Link>
    {item.condition && <p>{item.condition}</p>}<a className="text-link" href={item.source.source_url} target="_blank" rel="noreferrer">Official source</a>
  </li>)}</ol>
}

function UpcomingFacts({ slug }: { slug: string }) {
  const result = useApi(api.service, slug)
  if (result.loading) return <Loading />
  if (result.error != null) return <ConnectionError error={result.error} retry={result.retry} />
  return <>
    <ApplicationFacts data={result.data?.catalogue ?? null} />
    {result.data?.sources.some(source => source.checked_at) && <ul className="citizen-link-list">{result.data.sources.filter(source => source.checked_at).map(source =>
      <li key={source.id}><a className="text-link" href={source.source_url} target="_blank" rel="noreferrer">{source.source_title}</a></li>
    )}</ul>}
  </>
}

export function CitizenPlanner() {
  const selection = useSelectedService()
  const { workspace, saving, save } = useCitizen()
  const journeys = useApi(citizenApi.journeys)
  const journey = journeys.data?.find(item => item.service_slug === selection.slug)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const next = journey?.tasks.find(item => item.status === 'pending')
  const watched = workspace.data?.reminders.includes(selection.slug)

  async function run(action: () => Promise<Journey>) {
    setBusy(true); setFailure('')
    try {
      const updated = await action()
      journeys.setData([updated, ...(journeys.data ?? []).filter(item => item.id !== updated.id)])
    } catch (error) { setFailure(errorMessage(error)) } finally { setBusy(false) }
  }

  return <div className="page-stack">
    <PageHeader title="Action Planner" description="Prepare a journey and see sourced prerequisites before you apply." icon={<GitFork size={23} />} />
    <section className="card panel section-stack"><ServicePicker selection={selection} />
      {failure && <p role="alert">{failure}</p>}
      {journeys.loading && <Loading />}
      {journeys.error != null && <ConnectionError error={journeys.error} retry={journeys.retry} />}
      {selection.service && journeys.data && (!journey
        ? <button className="button button-primary" type="button" disabled={busy} onClick={() => void run(() => citizenApi.startJourney(selection.slug))}>Start preparation journey</button>
        : <><h2>Preparation flow</h2><ol className="citizen-flow">{journey.tasks.map(task => <li key={task.id}><label className="inline-check"><input type="checkbox" checked={task.status === 'complete'} disabled={busy}
          onChange={event => { const complete = event.target.checked; void run(() => citizenApi.updateTask(journey.id, task.id, complete)) }} />{task.title}</label><StatusBadge tone={task.status === 'complete' ? 'green' : 'neutral'}>{task.status === 'complete' ? 'Complete' : 'Pending'}</StatusBadge></li>)}</ol>
          <p><strong>Next action:</strong> {next?.title ?? 'Review the official application steps.'}</p><PortalLink service={selection.service} /></>)}
    </section>
    {selection.service?.verification_status === 'verified' && <Link className="text-link" to={'/dashboard/documents/consistency?' + new URLSearchParams({ service: selection.slug }) + '#local-preparation'}>Check this plan against your unlocked wallet</Link>}
    {selection.service && <div className="citizen-two"><section className="card panel section-stack"><h2>Dependency flow</h2><Dependencies slug={selection.slug} /></section>
      <section className="card panel section-stack"><h2>Required documents</h2><CitizenChecklist slug={selection.slug} /></section></div>}
    <section id="upcoming" className="card panel section-stack"><h2>Upcoming scheme planner</h2>
      {selection.service && <UpcomingFacts slug={selection.slug} />}
      {selection.service ? <div className="button-row"><PortalLink service={selection.service} /><button type="button" className="button button-outline" aria-pressed={watched ?? false} disabled={saving || !workspace.data}
        onClick={() => void save(data => ({ ...data, reminders: toggleItem(data.reminders, selection.slug) }))}>{watched ? 'Remove from watchlist' : 'Save for later'}</button></div> : <p>Choose a service to add it to your dashboard watchlist.</p>}
    </section>
  </div>
}

export function CitizenGrievances() {
  const { workspace, saving, save } = useCitizen()
  const grievances = useApi(citizenApi.grievances)
  const [editing, setEditing] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const selected = grievances.data?.find(item => item.id === editing)
  const suggestion = useRef<HTMLSelectElement>(null)
  const { catalogue } = useCitizen()
  const [department, setDepartment] = useState('')
  const report = workspace.data?.grievances[editing]

  async function draft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setNotice('')
    try {
      const item = await citizenApi.saveDraft({
        title: String(data.get('title')).trim(), description: String(data.get('description')).trim(),
        department: department.trim() || null,
      }, editing || undefined)
      setEditing(item.id)
      grievances.setData([item, ...(grievances.data ?? []).filter(entry => entry.id !== item.id)])
      setNotice('Draft saved to your account.')
    } catch (error) { setNotice(errorMessage(error)) } finally { setBusy(false) }
  }

  return <div className="page-stack">
    <PageHeader title="Grievance Assistant & Tracker" description="Prepare a complaint and record updates you receive from the relevant authority." icon={<MessageSquareText size={22} />} />
    <Notice>Submit a complaint through the appropriate official channel. CPGRAMS offers tracking using its issued reference and may offer an appeal for eligible closed grievances.</Notice>
    <div className="button-row"><a className="button button-outline" href={OFFICIAL_GRIEVANCES} target="_blank" rel="noreferrer">Open official CPGRAMS <ExternalLink size={15} /></a>
      <button type="button" className="button button-primary" disabled={busy} onClick={() => { setEditing(''); setDepartment(''); setNotice('') }}>New draft</button></div>
    <GrievanceCopilot services={catalogue.data ?? []} />
    {grievances.loading && <Loading />}
    {grievances.error != null && <ConnectionError error={grievances.error} retry={grievances.retry} />}
    {workspace.error != null && <ConnectionError error={workspace.error} retry={workspace.retry} />}
    {grievances.data && <div className="citizen-two">
      <form className="card panel section-stack" key={editing || 'new'} onSubmit={draft}><h2>{editing ? 'Edit draft' : 'Prepare a complaint draft'}</h2>
        <label>Complaint title<input required name="title" maxLength={120} defaultValue={selected?.title} /></label>
        <label>Related service for department guidance<select ref={suggestion} defaultValue=""><option value="">Choose a known service</option>{(catalogue.data ?? []).filter(item => item.department).map(item => <option key={item.slug} value={item.department ?? ''}>{item.name}</option>)}</select></label>
        <button className="button button-outline" type="button" onClick={() => { if (suggestion.current?.value) setDepartment(suggestion.current.value) }}>Use catalogue department</button>
        <label>Department<input maxLength={100} value={department} onChange={event => setDepartment(event.target.value)} /></label>
        <label>Description<textarea name="description" rows={5} maxLength={2000} required defaultValue={selected?.description} placeholder="Describe the issue, its impact and your requested resolution." /></label>
        {selected && <details><summary>Saved draft preview</summary><p className="draft-copy">{selected.draft_text}</p></details>}
        <button className="button button-primary" disabled={busy}>Save draft</button>{notice && <p role="status">{notice}</p>}
      </form>
      {workspace.data && selected && <form className="card panel section-stack" key={selected.id} onSubmit={event => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        void (async () => {
          const ok = await save(data => ({ ...data, grievances: { ...data.grievances, [selected.id]: {
            reference: String(fields.get('reference')), submission_date: String(fields.get('date')) || null,
            status: fields.get('status') as typeof grievanceStatuses[number], next_step: String(fields.get('next')),
          } } }))
          if (ok) setNotice('User-reported status saved.')
        })()
      }}><div className="section-heading"><h2>Manual tracking</h2><StatusBadge>User Reported</StatusBadge></div>
        <p>Copy the reference from the official acknowledgement. Verified tracking requires an authorized integration.</p>
        <label>Reference number<input name="reference" maxLength={120} defaultValue={report?.reference} /></label>
        <label>Submission date<input name="date" type="date" defaultValue={report?.submission_date ?? ''} /></label>
        <label>Current status<select name="status" defaultValue={report?.status ?? 'Draft'}>{grievanceStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
        <label>Next action<input name="next" maxLength={120} defaultValue={report?.next_step} /></label>
        <button className="button button-primary" disabled={saving}>Save tracking update</button>
      </form>}
    </div>}
    <section className="card panel section-stack"><h2>Grievances</h2>
      {grievances.data?.length ? grievances.data.map(item => {
        const update = workspace.data?.grievances[item.id]
        return <article className="citizen-record-row" key={item.id}><div><h3>{item.title}</h3><p>{item.department ?? 'Department not recorded'} · {update?.reference || 'Reference not recorded'}</p><p>{update?.submission_date ?? 'Submission date not recorded'} · {update?.next_step || 'Next action not recorded'}</p></div>
          <div><StatusBadge>{update ? update.status + ' · User Reported' : 'Draft'}</StatusBadge><p>Last verified update: unavailable</p></div>
          <button type="button" className="button button-outline" onClick={() => { setEditing(item.id); setDepartment(item.department ?? ''); setNotice('') }}>Review grievance</button></article>
      }) : <EmptyState title="No grievance drafts">Save a complaint draft to open its manual tracking form.</EmptyState>}
    </section>
  </div>
}
