import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ScanLine } from 'lucide-react'
import { Link } from 'react-router'
import { Notice, PageHeader, Progress, StatusBadge } from './components'
import {
  ageTypes, booleanFields, confirmedDocument, expiryTypes, scanTypes, supportedImageTypes, validImageFile,
  type ConfirmedDocument, type Draft, type ScanType,
} from './document-scan-engine'
import { DocumentScanResults } from './document-scan-results'

type Step =
  | { phase: 'select' }
  | { phase: 'ready'; file: File }
  | { phase: 'processing' }
  | { phase: 'review'; draft: Draft }
  | { phase: 'done' }

export default function DocumentScan() {
  const [documents, setDocuments] = useState<ConfirmedDocument[]>([])
  const [type, setType] = useState<ScanType>(scanTypes[0])
  const [step, setStep] = useState<Step>({ phase: 'select' })
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [fileInputVersion, setFileInputVersion] = useState(0)
  const pending = useRef<AbortController | undefined>(undefined)
  const stage = useRef<HTMLElement>(null)
  const hasAge = ageTypes.includes(type)
  const hasExpiry = expiryTypes.includes(type)
  const booleanField = booleanFields[type as keyof typeof booleanFields]

  function cancelScan() {
    pending.current?.abort()
    pending.current = undefined
  }

  function clear() {
    cancelScan()
    setDocuments([])
    setStep({ phase: 'select' })
    setType(scanTypes[0])
    setFileInputVersion(value => value + 1)
    setFailure('')
    setMessage('Scan session cleared.')
  }

  useEffect(() => {
    window.addEventListener('pagehide', clear)
    return () => {
      window.removeEventListener('pagehide', clear)
      cancelScan()
    }
  }, [])

  function select(next: ScanType) {
    setType(next)
    setStep({ phase: documents.some(document => document.type === next) ? 'done' : 'select' })
    setFileInputVersion(value => value + 1)
    setMessage('')
    setFailure('')
  }

  function pickFile(file?: File) {
    setFailure('')
    setMessage('')
    if (!file || !validImageFile(file)) {
      if (file) setFailure('Choose a JPEG, PNG, or WebP image up to 10 MB.')
      setStep({ phase: documents.some(document => document.type === type) ? 'done' : 'select' })
      return
    }
    setStep({ phase: 'ready', file })
  }

  async function scan(file: File) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setStep({ phase: 'processing' })
    setProgress(null)
    setFailure('')
    setMessage('')
    try {
      const { scanImage } = await import('./local-ocr')
      const { draft } = await scanImage(type, file, controller.signal, setProgress)
      if (!controller.signal.aborted) {
        setStep({ phase: 'review', draft })
        setFileInputVersion(value => value + 1)
        requestAnimationFrame(() => stage.current?.focus())
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setStep({ phase: 'ready', file })
        setFailure(error instanceof Error ? error.message : 'The local scan could not run. Try again.')
      }
    } finally {
      if (pending.current === controller) pending.current = undefined
    }
  }

  function confirm(event: FormEvent<HTMLFormElement>, draft: Draft) {
    event.preventDefault()
    try {
      const document = confirmedDocument(type, draft)
      setDocuments(current => [...current.filter(item => item.type !== type), document])
      setStep({ phase: 'done' })
      setFailure('')
      setMessage('OCR done for ' + type + '. Eligibility and document readiness updated.')
      requestAnimationFrame(() => stage.current?.focus())
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Review the extracted fields.')
    }
  }

  function edit(document: ConfirmedDocument) {
    const answer = document.landholding ?? document.gruha_lakshmi_household_head
    setStep({ phase: 'review', draft: { age: document.age === undefined ? '' : String(document.age), answer: answer === undefined ? '' : answer ? 'yes' : 'no', expiry: document.expiresOn ?? '' } })
    setFailure('')
    setMessage('')
  }

  function change(field: keyof Draft, value: string) {
    setStep(current => current.phase === 'review' ? { ...current, draft: { ...current.draft, [field]: value } } : current)
  }

  const existing = documents.find(document => document.type === type)
  const next = scanTypes.find(item => item !== type && !documents.some(document => document.type === item))
  const phaseLabel: Record<Step['phase'], string> = {
    select: 'Select File', ready: 'Scan', processing: 'OCR Processing', review: 'Review Extracted Data', done: 'OCR Done',
  }

  return <div className="page-stack">
    <PageHeader title="Scan documents privately" description="Scan one document at a time, review the extracted facts, and see scheme checks update in this page." icon={<ScanLine size={23} />} />
    <Notice>OCR runs in this browser. Scan images and confirmed facts stay out of the wallet and account profile. Refreshing, leaving this page, or clearing the session removes the scan progress. Crop or redact identity numbers and unrelated details before scanning.</Notice>
    <div className="button-row"><Link to="/dashboard/documents" className="text-link">Back to My Documents</Link>
      <button type="button" className="button button-outline" onClick={clear} disabled={!documents.length && step.phase === 'select'}>Clear scan session</button></div>
    <div className="citizen-two">
      <section className="card panel section-stack" aria-label="Supported document types">
        <h2>Supported documents</h2>
        <ul className="citizen-link-list">{scanTypes.map(item => <li className="section-heading" key={item}>
          <button className="text-link" type="button" disabled={step.phase === 'processing'} aria-pressed={item === type} onClick={() => select(item)}>{item}</button>
          <StatusBadge tone={documents.some(document => document.type === item) ? 'green' : 'neutral'}>{item === type ? phaseLabel[step.phase] :
            documents.some(document => document.type === item) ? 'OCR Done' : 'Select File'}</StatusBadge>
        </li>)}</ul>
      </section>
      <section className="card panel section-stack" aria-label="Selected document" ref={stage} tabIndex={-1}>
        <h2>{type}</h2><p><strong>{phaseLabel[step.phase]}</strong></p>
        {message && <p role="status">{message}</p>}{failure && <p role="alert">{failure}</p>}
        {(step.phase === 'select' || step.phase === 'ready' || step.phase === 'done') && <label>Select File
          <input key={fileInputVersion} type="file" accept={supportedImageTypes.join(',')} onChange={event => pickFile(event.currentTarget.files?.[0])} />
          <small>JPEG, PNG, or WebP up to 10 MB. Recognition is in English.</small>
        </label>}
        {step.phase === 'ready' && <button type="button" className="button button-primary" onClick={() => void scan(step.file)}>Scan</button>}
        {step.phase === 'processing' && <>
          <p role="status">OCR Processing in your browser…</p>
          {progress === null ? <progress className="progress" aria-label="Preparing local OCR" /> : <Progress value={progress} label="OCR progress" />}
          <button type="button" className="button button-outline" onClick={() => {
            cancelScan()
            setFileInputVersion(value => value + 1)
            setStep({ phase: existing ? 'done' : 'select' })
          }}>Cancel scan</button>
        </>}
        {step.phase === 'review' && <form className="section-stack" onSubmit={event => confirm(event, step.draft)}>
          <p>Check against the original document. Leave uncertain facts blank. Only the fields shown here are kept in this scan session.</p>
          {hasAge && <label>Age in completed years<input type="number" min="0" max="125" step="1" value={step.draft.age} onChange={event => change('age', event.target.value)} />
            <small>Review the detected age or the age calculated locally from a labelled date of birth.</small>
          </label>}
          {booleanField && <label>{booleanField === 'landholding' ? 'The applicant is from a landholding farmer family' : 'The applicant is the woman listed as head of household'}
            <select value={step.draft.answer} onChange={event => change('answer', event.target.value)}>
              <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </label>}
          {hasExpiry && <label>Expiry date, if shown<input type="date" value={step.draft.expiry} onChange={event => change('expiry', event.target.value)} /></label>}
          {!hasAge && !hasExpiry && !booleanField && <p>Readable text was detected. This document type contributes to the checklist without retaining any text.</p>}
          <label className="inline-check"><input type="checkbox" required /> I checked the original and confirm the selected document type and facts shown here.</label>
          <div className="button-row"><button className="button button-primary">Confirm document</button>
            <button type="button" className="button button-outline" onClick={() => select(type)}>Discard review</button></div>
        </form>}
        {step.phase === 'done' && existing && <>
          <p>OCR Done marks this scan as confirmed for the scheme checklist. <Link className="text-link" to="/dashboard/documents/consistency">Compare names in Document Consistency Check</Link>.</p>
          <div className="button-row">
            {next && <button type="button" className="button button-primary" onClick={() => select(next)}>Scan next document</button>}
            {(hasAge || hasExpiry || booleanField) && <button type="button" className="button button-outline" onClick={() => edit(existing)}>Edit confirmed facts</button>}
            <button type="button" className="button button-outline" onClick={() => {
              setDocuments(items => items.filter(item => item.type !== type))
              setStep({ phase: 'select' })
              setMessage('Removed from this scan session.')
              setFailure('')
            }}>Remove scan</button>
          </div>
        </>}
      </section>
    </div>
    <DocumentScanResults documents={documents} />
  </div>
}
