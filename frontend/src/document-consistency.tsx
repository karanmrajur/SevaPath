import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { ScanLine } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { api } from './api'
import type { LocalAssistantReport } from './jansetu-api'
import { useCitizen, type WalletScan } from './citizen-context'
import { citizenApi } from './citizen-api'
import { WalletGate } from './citizen-wallet'
import { Notice, PageHeader, Progress } from './components'
import {
  activeRecords, comparisons, effectiveDocuments, emptyReview, fields, fieldValue, multiplePeople, safeValue,
  type AddressScope, type Decision, type Evidence, type Field, type NameExtraction, type OcrValue, type ReviewData, type ScanRecord, type Values,
} from './document-consistency-engine'
import { deleteReview, openReview, putReview, readReview, reviewKey, sealReview, type EncryptedReview } from './document-consistency-storage'
import { ComparisonCard, ConsistencySummary, recordLabel } from './document-consistency-cards'
import { assessScan, indiaToday, scanTypes, supportedImageTypes, validImageFile, type ScanType } from './document-scan-engine'
import { DocumentScanResults } from './document-scan-results'
import { CitizenPreparation } from './citizen-preparation'
import { manualLanguages, ocrModels, recognizedLanguages, type OcrModel, type OcrReading } from './ocr-models'
import { ConsistencyDiagnostics, type ReviewTrace } from './document-consistency-diagnostics'
import './document-consistency.css'

type Session = { data: ReviewData; encrypted?: EncryptedReview; key?: CryptoKey }
type Scan = { type: ScanType; file?: File; record?: ScanRecord; reading?: OcrReading; linked?: boolean; rescan?: ScanRecord; processing: boolean }
const initialScan: Scan = { type: scanTypes[0], processing: false }

function EncryptedHistory({ scope }: { scope: string }) {
  const { temporaryReview, setTemporaryReview, setAssistantReport } = useCitizen()
  const [session, setSession] = useState<Session | undefined>(() => temporaryReview ? { data: temporaryReview } : undefined)
  const [knownSaved, setKnownSaved] = useState<boolean>()
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const channel = useRef<BroadcastChannel | undefined>(undefined)
  const accessGeneration = useRef(0)

  useEffect(() => {
    let current = true
    readReview(scope).then(record => { if (current) setKnownSaved(!!record) }).catch(() => {
      if (current) setError('Encrypted storage is unavailable in this browser. You can still review scans in memory.')
    })
    const changes = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('sevapath-document-consistency')
    channel.current = changes
    if (changes) changes.onmessage = event => {
      if (event.data?.scope !== scope || event.data?.deleted !== true) return
      accessGeneration.current++
      setSession(previous => previous?.key ? undefined : previous)
      setAssistantReport(undefined)
      setKnownSaved(false)
      setMessage('Saved consistency data was deleted in another tab.')
    }
    const lock = () => {
      accessGeneration.current++
      setSession(undefined)
    }
    window.addEventListener('pagehide', lock)
    return () => {
      current = false
      accessGeneration.current++
      channel.current = undefined
      changes?.close()
      window.removeEventListener('pagehide', lock)
    }
  }, [scope, setAssistantReport])

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const passphrase = String(values.get('passphrase') ?? '')
    const confirmation = String(values.get('confirmation') ?? '')
    const generation = accessGeneration.current
    form.reset()
    setError('')
    setWorking(true)
    try {
      const previous = await readReview(scope)
      if (!previous && (passphrase.length < 14 || passphrase !== confirmation)) {
        setError('Use a separate passphrase of at least 14 characters and enter it twice.')
        return
      }
      const salt = previous?.salt ?? crypto.getRandomValues(new Uint8Array(16))
      const key = await reviewKey(passphrase, salt)
      const data = previous ? await openReview(scope, key, previous) : emptyReview()
      const encrypted = previous ?? await sealReview(scope, key, salt, data)
      if (generation !== accessGeneration.current) return
      if (!previous) await putReview(scope, encrypted)
      setKnownSaved(true)
      if (generation !== accessGeneration.current) return
      setTemporaryReview(undefined)
      setSession({ data, key, encrypted })
      setMessage('Encrypted history unlocked.')
    } catch {
      setError('Cannot open the encrypted history. Check your passphrase or reload if another tab changed it.')
    } finally { setWorking(false) }
  }

  async function save(data: ReviewData) {
    if (!session || working) return false
    const generation = accessGeneration.current
    setError('')
    setWorking(true)
    try {
      if (!session.key || !session.encrypted) {
        setTemporaryReview(data)
        setSession({ data })
      }
      else {
        const encrypted = await sealReview(scope, session.key, session.encrypted.salt, data)
        if (generation !== accessGeneration.current) return false
        await putReview(scope, encrypted, session.encrypted.nonce)
        if (generation !== accessGeneration.current) return false
        setSession({ ...session, data, encrypted })
      }
      return true
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes('another tab') ? cause.message : 'Unable to save encrypted history. The previous record is still active.')
      return false
    } finally { setWorking(false) }
  }

  async function erase() {
    if (working || !window.confirm('Permanently delete the saved consistency scans and review history from this browser?')) return
    setWorking(true)
    setError('')
    try {
      await deleteReview(scope)
      setAssistantReport(undefined)
      setSession(undefined)
      setKnownSaved(false)
      setMessage('Saved scans and review history deleted from this browser.')
      channel.current?.postMessage({ scope, deleted: true })
    } catch { setError('Could not delete the saved history. Try again.') }
    finally { setWorking(false) }
  }

  return <div className="page-stack">
    <Notice>Compare documents about you. Your browser reads the images and compares selected fields. Saved history is optional and encrypted on this device with its own passphrase. SevaPath cannot recover that passphrase. User confirmation records a review. Only the issuing authority can verify or correct an official record.</Notice>
    <div className="button-row">
      <Link className="text-link" to="/dashboard/documents">Back to Document Wallet</Link>
      {session && <button type="button" className="button button-outline" disabled={working} onClick={() => {
        if (!session.key) setTemporaryReview(undefined)
        setAssistantReport(undefined)
        setSession(undefined)
        setMessage(session.key ? 'Consistency history locked.' : 'Temporary consistency session cleared.')
      }}>{session.key ? 'Lock consistency history' : 'Clear temporary session'}</button>}
      {knownSaved && <button type="button" className="button button-outline" disabled={working} onClick={() => void erase()}>Delete saved consistency data</button>}
    </div>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {session ? <ReviewSession data={session.data} save={save} busy={working} encrypted={!!session.key} /> : <section className="card panel section-stack">
      <h2>Start a consistency check</h2>
      <p>A temporary session keeps confirmed scans while you move between Wallet and Consistency Check. Locking the wallet, refreshing or leaving the wallet clears them. Use encrypted history to reopen them later.</p>
      {knownSaved && <Notice>Unlock encrypted history to compare your saved scans. A temporary session starts a separate comparison.</Notice>}
      <details><summary>OCR diagnostics (private)</summary><p>Prior records loaded: No. {knownSaved ? 'Unlock encrypted history to compare previously confirmed documents.' : 'Start a consistency session to scan and compare documents.'}</p></details>
      <button type="button" className="button button-outline" disabled={working} onClick={() => {
        setError('')
        setMessage('')
        const data = emptyReview()
        setTemporaryReview(data)
        setSession({ data })
      }}>Start temporary session</button>
      {knownSaved !== undefined && <form className="section-stack" onSubmit={unlock}>
        <label>Consistency passphrase<input type="password" name="passphrase" required autoComplete={knownSaved ? 'off' : 'new-password'} maxLength={256} minLength={knownSaved ? undefined : 14} /></label>
        {!knownSaved && <label>Confirm consistency passphrase<input type="password" name="confirmation" autoComplete="new-password" required minLength={14} maxLength={256} /></label>}
        <button className="button button-primary" disabled={working}>{knownSaved ? 'Unlock saved consistency history' : 'Create encrypted consistency history'}</button>
      </form>}
    </section>}
  </div>
}

function ReviewSession({ data, save, busy, encrypted }: {
  data: ReviewData; save: (data: ReviewData) => Promise<boolean>; busy: boolean; encrypted: boolean
}) {
  const [scan, setScan] = useState<Scan>(initialScan)
  const [trace, setTrace] = useState<ReviewTrace>({ type: initialScan.type, phase: 'Waiting for a file' })
  const { walletScan, setWalletScan, wallet, setAssistantReport } = useCitizen()
  const navigate = useNavigate()
  const [creatingReport, setCreatingReport] = useState(false)
  const reportRequest = useRef<AbortController | undefined>(undefined)
  const [models, setModels] = useState<OcrModel[]>([])
  const [rechecking, setRechecking] = useState(0)
  const [subjectConfirmed, setSubjectConfirmed] = useState(false)
  const [scanProgress, setScanProgress] = useState<number>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [fileKey, setFileKey] = useState(0)
  const [before, setBefore] = useState<ReturnType<typeof effectiveDocuments>['documents']>()
  const pending = useRef<AbortController | undefined>(undefined)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const records = useMemo(() => activeRecords(data.records), [data.records])
  const effective = useMemo(() => effectiveDocuments(data), [data, rechecking])

  useEffect(() => () => { pending.current?.abort(); reportRequest.current?.abort() }, [])

  function reset(type: ScanType, cancelled = false) {
    pending.current?.abort()
    pending.current = undefined
    setScan({ type, processing: false })
    setTrace({ type, phase: cancelled ? 'Cancelled' : 'Waiting for a file' })
    setSubjectConfirmed(false)
    setScanProgress(undefined)
    setFileKey(value => value + 1)
    setError('')
    setNotice('')
  }

  function selectRescan(record: ScanRecord) {
    reset(record.type)
    setScan({ type: record.type, processing: false, rescan: record })
    requestAnimationFrame(() => fileInput.current?.focus())
  }

  function showReview(type: ScanType, evidence: Evidence, name: NameExtraction, reading?: OcrReading,
    source?: Partial<ScanRecord>, failed = false, candidates?: OcrValue[]) {
    const values: Values = {}
    for (const field of Object.keys(evidence) as Field[]) values[field] = evidence[field]?.value
    const id = crypto.randomUUID()
    setScan({ type, processing: false, reading, linked: !!source, record: { id, documentKey: id, type, evidence, values,
      addressScope: '', confirmedAt: new Date().toISOString(), ...(candidates?.length ? { nameCandidates: candidates } : {}), ...source } })
    setTrace(previous => ({
      type, phase: failed ? 'OCR failed; manual review' : reading ? 'Awaiting review' : 'Manual transcription',
      reading, extraction: name, detectedName: evidence.name, recordId: id,
      ...(failed ? { reading: previous.reading, failedAt: previous.phase } : {}),
    }))
    setSubjectConfirmed(false)
    setFileKey(value => value + 1)
    requestAnimationFrame(() => reviewHeading.current?.focus())
  }

  function rescanSource(record?: ScanRecord): Partial<ScanRecord> | undefined {
    return record ? { supersedes: record.id, documentKey: record.documentKey, walletFile: record.walletFile } : undefined
  }

  function sourceFor(wallet: WalletScan): Partial<ScanRecord> {
    const previous = records.find(record => record.walletFile === wallet.id)
    return { walletFile: wallet.id, ...(previous ? { supersedes: previous.id, documentKey: previous.documentKey } : {}) }
  }

  async function run(type: ScanType, file?: File, wallet?: WalletScan) {
    if ((!file && !wallet) || pending.current) return
    const source = wallet ? sourceFor(wallet) : rescanSource(scan.rescan)
    if (wallet?.mime === 'application/pdf') {
      showReview(type, {}, 'missing', undefined, source)
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setScan({ type, processing: true })
    setScanProgress(undefined)
    setTrace({ type, phase: wallet ? 'Reading wallet image' : 'Initializing OCR' })
    setError('')
    setNotice('')
    try {
      const { scanImage } = await import('./local-ocr')
      const image = wallet
        ? new File([await citizenApi.documentBlob(wallet.id, controller.signal)], 'wallet-image', { type: wallet.mime })
        : file
      if (!image) return
      const { evidence, reading, name, candidates } = await scanImage(type, image, controller.signal, setScanProgress, true, models, phase => {
        if (!controller.signal.aborted) setTrace({ type, phase })
      })
      if (!controller.signal.aborted) showReview(type, evidence, name, reading, source, false, candidates)
    } catch (failure) {
      if (!controller.signal.aborted) {
        showReview(type, {}, 'missing', undefined, source, true)
        setError(failure instanceof Error ? failure.message : 'Could not scan this image.')
      }
    } finally {
      if (pending.current === controller) pending.current = undefined
    }
  }

  function startWalletScan(type: ScanType, wallet: WalletScan) {
    setWalletScan(undefined)
    void run(type, undefined, wallet)
  }

  useEffect(() => {
    if (!walletScan || data.records.length >= 40) return
    const type = scanTypes.find(item => item === walletScan.category)
    if (!type) return
    // Mount after the wallet and optional history unlock. The task can be cancelled by unmount.
    const timer = window.setTimeout(() => startWalletScan(type, walletScan), 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function commit(next: ReviewData, feedback: string) {
    if (await save(next)) {
      setAssistantReport(undefined)
      setBefore(effective.documents)
      setNotice(feedback)
      return true
    }
    return false
  }

  async function shareSummary() {
    if (!records.length || reportRequest.current) return
    const controller = new AbortController()
    reportRequest.current = controller
    setCreatingReport(true)
    try {
      const catalogue = await api.scanCatalogue('', controller.signal)
      if (controller.signal.aborted || !wallet.data?.unlocked_until || Date.parse(wallet.data.unlocked_until) <= Date.now()) return
      const scoped = records.filter(record => record.type === 'Aadhaar Card' || record.type === 'Income certificate')
      const name = new Set(scoped.map(record => record.type)).size === 2
        ? comparisons(scoped).find(group => group.field === 'name' && scoped.every(record => fieldValue(record, 'name'))) : undefined
      const report: LocalAssistantReport = { profile: [], documents: [],
        consistency: name?.status === 'MATCH' ? 'match' : name?.status === 'MISMATCH' ? 'difference' : 'unknown' }
      const today = indiaToday()
      for (const entry of catalogue) {
        const { service } = entry
        const result = assessScan(entry, effective.documents)
        if (result.checks.length) report.profile.push({
          slug: service.slug, name: service.name,
          status: result.status === 'insufficient_information' ? 'potentially_eligible' : result.status,
          partial: entry.partial_rule_coverage,
          checks: result.checks.map(({ rule, status }) => ({ explanation: rule.explanation,
            met: status === 'unknown' ? null : status === 'matched',
            source: { title: rule.source.source_title, url: rule.source.source_url, checked_at: rule.source.checked_at, official: true } })),
        })
        if (result.required) report.documents.push({
          slug: service.slug, name: service.name, required: result.required, available: result.ready, percentage: result.percentage,
          items: result.requirements.map(({ requirement, state }) => ({
            id: requirement.id, name: requirement.document_name, status: requirement.required_status,
            state: state === 'ready' ? 'available' : state === 'missing' ? 'missing' : 'review',
            expiring: effective.documents.flatMap(document => document.expiresOn && !document.confirmationPending
              && requirement.accepted_categories.includes(document.type) && document.expiresOn >= today
              && Date.parse(document.expiresOn) - Date.parse(today) <= 30 * 86_400_000 ? [document.expiresOn] : []).sort()[0] ?? null,
          })),
        })
      }
      setAssistantReport(report)
      navigate('/dashboard/assistant')
    } catch {
      if (!controller.signal.aborted) setError('Could not prepare the local summary. Try again.')
    } finally {
      reportRequest.current = undefined
      if (!controller.signal.aborted) setCreatingReport(false)
    }
  }

  function changeRecord(change: Partial<ScanRecord>) {
    setScan(current => current.record ? { ...current, record: { ...current.record, ...change } } : current)
  }

  async function confirm(event: FormEvent<HTMLFormElement>, record: ScanRecord) {
    event.preventDefault()
    if (!subjectConfirmed) return
    const values: Values = {}
    const evidence: Evidence = record.evidence.name ? { name: record.evidence.name } : {}
    for (const field of Object.keys(record.values) as Field[]) {
      const input = record.values[field]?.trim() ?? ''
      if (!input) continue
      const value = safeValue(field, input)
      if (!value) {
        setError('Check ' + fields[field].toLowerCase() + ' and leave identity numbers out of the review.')
        return
      }
      values[field] = value
      if (record.evidence[field]) evidence[field] = record.evidence[field]
    }
    const superseded = records.find(item => item.id === record.supersedes)
    if (superseded && fieldValue(superseded, 'name') && !values.name) {
      setError('Enter the full name or discard this review. The earlier scan is still active.')
      return
    }
    const confirmed: ScanRecord = { ...record, values, evidence, nameVerified: values.name ? true : undefined, confirmedAt: new Date().toISOString() }
    if (await commit({ ...data, records: [...data.records, confirmed] }, 'Document confirmed. Consistency and scheme assessments updated.')) {
      setScan({ type: record.type, processing: false })
      setTrace(current => ({ ...current, phase: 'Confirmed' }))
      setSubjectConfirmed(false)
      setScanProgress(undefined)
      setError('')
    }
  }

  const record = scan.record
  const target = record ?? records.find(item => item.id === trace.recordId)
  const needsOwner = !!record && (multiplePeople(record.type) || trace.extraction !== 'label'
    || record.values.name !== record.evidence.name?.value)
  const ownerReady = !needsOwner || subjectConfirmed
  const previous = records.filter(item => item.id !== target?.id)
  const reviewed = !target ? comparisons(records) : ownerReady ? comparisons(
    [...(record ? data.records : records).filter(item => item.id !== target.id), { ...target, nameVerified: subjectConfirmed && target.values.name ? true : target.nameVerified }],
    target.id,
  ) : []
  const staged = record ? reviewed.filter(group => group.status !== 'MATCH'
    && (group.field === 'name' || fieldValue(record, group.field))) : []
  const stagedName = staged.find(group => group.field === 'name')
  const comparable = !target || fieldValue(target, 'name') ? previous.filter(item => fieldValue(item, 'name')).length : 0
  const evaluated = reviewed.some(group => target ? fieldValue(target, group.field)
    && group.records.some(item => item.id !== target.id && fieldValue(item, group.field))
    : group.records.filter(item => fieldValue(item, group.field)).length > 1)
  const nameComparison = comparable ? reviewed.find(group => group.field === 'name') : undefined
  const traceReason = !target ? comparable > 1
    ? 'Previously confirmed names rechecked from this history.' : 'Run OCR or open manual transcription.'
    : !ownerReady ? 'Confirm that the name belongs to you and matches the document.'
      : !fieldValue(target, 'name') ? 'The current document has no usable full name.'
        : !previous.length ? 'Confirm another document before comparing names.'
          : !comparable ? 'Earlier confirmed documents have no usable full name.'
            : nameComparison?.status === 'UNVERIFIED' ? 'Compared; review low confidence or different scripts.'
              : nameComparison?.status === 'POSSIBLE_MATCH' ? 'Compared; the spelling or script needs review.'
                : nameComparison?.status === 'MISMATCH' ? 'Compared; different names found.'
                  : 'Compared available names; no difference found.'
  const sameType = records.filter(previous => previous.type === scan.type)
  const next = scanTypes.find(type => !records.some(previous => previous.type === type))
  const allowed = data.records.length < 40

  return <>
    <section className="card panel section-stack" aria-label="Scan for consistency">
      <h2>Scan a document for comparison</h2>
      <p>{encrypted ? 'Encrypted history is active on this browser.' : 'This temporary session keeps scans in memory.'} Scan one JPEG, PNG or WebP up to 10 MB.</p>
      {!allowed && <Notice>This history contains 40 scans. Start a temporary session or delete the saved history to make room.</Notice>}
      {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
      <label>Document type<select value={scan.type} disabled={scan.processing || busy || !allowed} onChange={event => reset(event.target.value as ScanType)}>
        {scanTypes.map(type => <option value={type} key={type}>{type}</option>)}
      </select></label>
      {!record && !scan.processing && allowed && <>
        <details><summary>Choose OCR languages</summary>
          <fieldset className="section-stack">
            <legend>OCR language models</legend>
            <label className="inline-check"><input type="radio" name="ocr-mode" checked={!models.length} onChange={() => setModels([])} /> Detect script automatically</label>
            <label className="inline-check"><input type="radio" name="ocr-mode" checked={!!models.length} onChange={() => setModels(['eng'])} /> Choose languages for this image</label>
            {models.length > 0 && <div className="citizen-two">
              {(Object.keys(ocrModels) as OcrModel[]).map(model => <label className="inline-check" key={model}>
                <input type="checkbox" checked={models.includes(model)} disabled={!models.includes(model) && models.length >= 4}
                  onChange={event => setModels(event.target.checked ? [...models, model] : models.filter(item => item !== model))} />
                {ocrModels[model].label}
              </label>)}
            </div>}
            <p className="metadata">Choose up to four models for mixed-language images. For {manualLanguages.join(', ')}, transcribe fields manually or review the output from a compatible script model.</p>
          </fieldset>
        </details>
        {scan.rescan && <Notice>Choose a clearer image to rescan {recordLabel(scan.rescan)}. The earlier evidence will stay in your history.</Notice>}
        <label>Select File<input ref={fileInput} key={fileKey} type="file" accept={supportedImageTypes.join(',')} onChange={event => {
          const file = event.currentTarget.files?.[0]
          const usable = file && validImageFile(file)
          setError(file && !usable ? 'Choose a JPEG, PNG, or WebP image up to 10 MB.' : '')
          setScan(current => ({ ...current, file: usable ? file : undefined }))
          setTrace({ type: scan.type, phase: usable ? 'File selected' : 'Waiting for a file' })
        }} /></label>
        {walletScan && <Notice>A wallet file is ready for review. Choose its document type if needed, then scan the image or transcribe the fields from a PDF.</Notice>}
        <div className="button-row">{walletScan && <button type="button" className="button button-primary" disabled={busy} onClick={() => startWalletScan(scan.type, walletScan)}>
            {walletScan.mime === 'application/pdf' ? 'Transcribe wallet PDF' : 'Scan wallet image'}
          </button>}
          <button onClick={() => void run(scan.type, scan.file)} type="button" className="button button-primary" disabled={!scan.file || busy}>Scan</button>
          <button type="button" className="button button-outline" disabled={busy} onClick={() => { setError(''); showReview(scan.type, {}, 'missing', undefined, rescanSource(scan.rescan)) }}>Transcribe without OCR</button>
          {data.records.length > 0 && next && next !== scan.type && <button type="button" className="button button-outline" onClick={() => reset(next)}>Scan next document</button>}
        </div>
      </>}
      {scan.processing && <>
        <p role="status">OCR Processing in this browser…</p>
        {scanProgress === undefined ? <progress className="progress" aria-label="Loading OCR" /> : <Progress value={scanProgress} label="OCR progress" />}
        <button type="button" className="button button-outline" onClick={() => reset(scan.type, true)}>Cancel scan</button>
      </>}
      {record && <>
        <h3 ref={reviewHeading} tabIndex={-1}>Review extracted data</h3>
        {scan.reading ? <div aria-label="OCR result" className="section-stack">
          <p>OCR finished · {Object.keys(record.evidence).length} fields extracted · {scan.reading.confidence === null ? 'confidence unavailable' : scan.reading.confidence + '% page confidence'}</p>
          <p>Detected script: {scan.reading.scripts.join(', ') || 'undetermined'} · Likely languages: {recognizedLanguages(scan.reading.scripts).join(', ') || 'undetermined'}.</p>
          <p className="metadata">Models used: {scan.reading.models.map(model => ocrModels[model].label).join(', ')}.</p>
          {scan.reading.auto && <p className="metadata">Shared scripts can represent several languages. Choose the language and rescan if automatic recognition is unclear.</p>}
        </div> : <p>Manual transcription. Enter values in the script shown on the document.</p>}
        {staged.some(group => group.status === 'MISMATCH') && <p className="consistency-alert" role="alert">
          DOCUMENT MISMATCH DETECTED — {staged.some(group => group.field === 'name' && group.status === 'MISMATCH') ? 'Full Name' : 'Review required'}
        </p>}
        {stagedName?.status !== 'MISMATCH' && (!fieldValue(record, 'name') || !ownerReady || stagedName) && <p role="status" className="consistency-review-status">
          REVIEW REQUIRED — {!fieldValue(record, 'name') ? 'Enter the full name from this document.' : !ownerReady
            ? 'Confirm the owner and spelling to compare the name.' : 'Check the names and OCR evidence.'}
        </p>}
        {multiplePeople(scan.type) && <Notice>This type can list several people. OCR looks for applicant labels and clearly labelled holder or owner names. Keep values from your own row or role only. Confirm that they describe you to compare them with earlier scans.</Notice>}
        <form className="section-stack" onSubmit={event => void confirm(event, record)}>
          <p>Compare each value with the image. Keep only the fields you want to use. Original extracted evidence for these reviewed fields stays unchanged.</p>
          {!record.evidence.name && <p className="consistency-alert" role="status">Name not extracted — please confirm manually.</p>}
          {trace.extraction === 'ambiguous' && <p>OCR found competing name candidates. Enter your own name exactly as printed.</p>}
          {!!record.nameCandidates?.length && <details><summary>View competing OCR evidence</summary><ul>
            {record.nameCandidates.map((candidate, index) => <li key={index}><bdi>{candidate.value}</bdi> · {candidate.confidence ?? 'unknown'} OCR confidence</li>)}
          </ul></details>}
          {trace.extraction === 'layout-candidate' && <p>OCR found a name from the document layout. Confirm it belongs to you and check the spelling.</p>}
          <ReviewInput field="name" record={record} change={value => {
            changeRecord({ values: { ...record.values, name: value } })
            setSubjectConfirmed(false)
          }} />
          <div className="citizen-two">
            {(Object.keys(fields) as Field[]).filter(field => field !== 'name' && record.evidence[field]).map(field =>
              <ReviewInput key={field} field={field} record={record} change={value => changeRecord({ values: { ...record.values, [field]: value } })} />)}
          </div>
          <details open={!Object.keys(record.evidence).length}><summary>{scan.reading ? 'Add fields that OCR missed' : 'Enter document fields'}</summary><div className="citizen-two">
            {(Object.keys(fields) as Field[]).filter(field => field !== 'name' && !record.evidence[field]).map(field =>
              <ReviewInput key={field} field={field} record={record} change={value => changeRecord({ values: { ...record.values, [field]: value } })} />)}
          </div></details>
          <label>Scope of the printed address, village, district, state and PIN code<select value={record.addressScope} onChange={event => changeRecord({ addressScope: event.target.value as AddressScope })}>
            <option value="">Unknown or unspecified</option><option value="permanent">Permanent address</option><option value="current">Current address</option>
          </select></label>
          {!scan.linked && sameType.length > 0 && <label>Rescan of a confirmed document
            <select value={record.supersedes ?? ''} onChange={event => {
              const previous = sameType.find(item => item.id === event.target.value)
              changeRecord({ supersedes: previous?.id, documentKey: previous?.documentKey ?? record.id, walletFile: previous?.walletFile })
            }}>
              <option value="">Additional document</option>
              {sameType.map(previous => <option value={previous.id} key={previous.id}>{recordLabel(previous)}</option>)}
            </select>
          </label>}
          <label className="inline-check"><input type="checkbox" required checked={subjectConfirmed} onChange={event => setSubjectConfirmed(event.target.checked)} /> I am the subject of the fields I entered or kept, and I checked the exact spelling of my name against the document.</label>
          <div className="button-row"><button className="button button-primary" disabled={busy || !allowed}>Confirm document</button>
            <button type="button" className="button button-outline" disabled={busy} onClick={() => reset(scan.type)}>Discard review</button></div>
        </form>
        {staged.length > 0 && <section aria-label="Differences from earlier scans" className="section-stack">
          <h3>Differences from earlier scans</h3>
          <p>Check these values before confirming. After confirming, you can record a decision without changing either source.</p>
          {staged.map(group => <ComparisonCard key={group.key} group={group} />)}
        </section>}
      </>}
      <ConsistencyDiagnostics trace={trace} prior={previous.length}
        history={encrypted ? 'Encrypted history open' : 'Current temporary wallet session'}
        comparable={comparable} evaluated={evaluated} conflicts={reviewed.filter(group => group.status === 'MISMATCH').length} reason={traceReason} />
    </section>
    <div id="document-reviews"><ConsistencySummary data={data} recheck={() => {
      setRechecking(value => value + 1)
      setNotice('All confirmed documents rechecked using saved fields.')
    }} addDecision={(decision: Decision) => {
      void commit({ ...data, decisions: [...data.decisions, decision] }, 'Review decision recorded. Scheme assessments updated.')
    }} busy={busy} onRescan={selectRescan} /></div>
    {records.length > 0 && <section className="card panel section-stack">
      <h2>Use a local summary in JanSetu</h2>
      <p>Share only the results of your document and scheme checks in this tab. Images, names, identifiers and OCR evidence stay in the wallet.</p>
      <div><button type="button" className="button button-outline" disabled={creatingReport || busy}
        onClick={() => void shareSummary()}>Share summary with JanSetu</button></div>
    </section>}
    <CitizenPreparation data={data} documents={effective.documents} conflictFields={effective.conflictFields} save={save} busy={busy} />
    <DocumentScanResults documents={effective.documents} previousDocuments={before} conflictFields={effective.conflictFields} />
  </>
}

function ReviewInput({ field, record, change }: { field: Field; record: ScanRecord; change: (value: string) => void }) {
  const id = useId()
  const extracted = record.evidence[field]
  return <div>
    <label htmlFor={id}>{fields[field]}</label>
    <input id={id} dir="auto" value={record.values[field] ?? ''} maxLength={240} autoComplete="off"
      aria-describedby={extracted ? id + '-confidence' : undefined} onChange={event => change(event.target.value)} />
    {extracted && <small id={id + '-confidence'}>{extracted.confidence == null ? 'OCR confidence unavailable'
      : extracted.confidence + '% OCR line confidence'}</small>}
  </div>
}

export default function DocumentConsistency() {
  const { wallet, walletOpen } = useCitizen()
  const scope = walletOpen ? wallet.data?.local_review_scope : undefined
  return <div className="page-stack">
    <PageHeader title="Document Consistency Check" description="Compare fields across your scans and review differences before using them for scheme checks." icon={<ScanLine size={23} />} />
    <WalletGate>{scope ? <EncryptedHistory key={scope} scope={scope} /> : <Notice>Wallet scope is unavailable. Refresh or restart the SevaPath backend to continue.</Notice>}</WalletGate>
  </div>
}
