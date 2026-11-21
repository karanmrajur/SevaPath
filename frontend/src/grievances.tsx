import { useRef, useState, type FormEvent } from 'react'
import { CircleCheck, FilePenLine, Landmark, MessageSquareWarning } from 'lucide-react'
import { api, errorMessage, type GrievanceDraft } from './api'
import { ConnectionError, EmptyState, Loading, Milestone, Notice, PageHeader, StatusBadge } from './components'
import type { LegacyComplaintDraft } from './data'
import { useWorkspace } from './preferences'
import { useApi } from './use-api'

export function Grievances() {
  const workspace = useApi(api.grievances)
  const { legacyDraft } = useWorkspace()

  return (
    <div className="page-stack">
      <PageHeader title="Grievances" description="Prepare a complaint draft and review it before using an official channel." icon={<MessageSquareWarning size={24} />} />
      <Notice>Use sample details and omit personal identifiers. SevaPath stores drafts for this anonymous browser session. Drafts are for local preparation only.</Notice>
      {workspace.loading ? <Loading /> : workspace.error != null ? <ConnectionError error={workspace.error} retry={workspace.retry} />
        : <GrievanceEditor initial={workspace.data?.[0]} legacy={legacyDraft} />}
    </div>
  )
}

function GrievanceEditor({ initial, legacy }: { initial?: GrievanceDraft; legacy?: LegacyComplaintDraft | null }) {
  const [draft, setDraft] = useState(initial)
  const [subject, setSubject] = useState(initial?.title ?? legacy?.subject ?? '')
  const [department, setDepartment] = useState(initial?.department ?? (initial ? '' : legacy?.department ?? ''))
  const [description, setDescription] = useState(initial?.description ?? legacy?.description ?? '')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const request = useRef<{ payload: string; id: string }>(undefined)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!subject.trim() || !description.trim() || busy) return
    const fields = { title: subject.trim(), department: department.trim() || null, description: description.trim() }
    const payload = JSON.stringify(fields)
    if (!request.current || request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() }

    setBusy(true)
    setError(undefined)
    setSaved(false)
    try {
      setDraft(await api.saveDraft(fields, request.current.id, draft?.id))
      setSaved(true)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="work-grid">
      <form className="card panel section-stack" onSubmit={save} onChange={() => { setSaved(false); setError(undefined) }}>
        <h2>Complaint draft</h2>
        {!draft && legacy && <p className="metadata">Your earlier browser draft is ready to review. Save it to add it to this session.</p>}
        <label>Subject<input required disabled={busy} maxLength={120} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Summarise the issue" /></label>
        <label>Department (optional)<input disabled={busy} maxLength={100} value={department} onChange={event => setDepartment(event.target.value)} placeholder="Enter the department, if known" /></label>
        <label>Description<textarea required disabled={busy} rows={7} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe what happened and the resolution you’re seeking." /></label>
        <div className="button-row"><button className="button button-primary" type="submit" disabled={busy || !subject.trim() || !description.trim()}><FilePenLine size={17} /> {busy ? 'Saving…' : error ? 'Retry save' : 'Save draft'}</button>
          <span className="save-message" role="status">{saved && 'Draft saved to SevaPath'}</span>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
      <div className="section-stack">
        <section className="card panel section-stack">
          {draft ? <>
            <div className="section-heading"><h2>Draft preview</h2><StatusBadge tone="blue">{draft.local_status === 'ready' ? 'Ready for review' : draft.local_status === 'archived' ? 'Archived' : 'Local draft'}</StatusBadge></div>
            <div className="draft-copy"><h3>{draft.title}</h3>{draft.department && <p className="metadata">{draft.department}</p>}<p>{draft.description}</p></div>
            <h3>Local tracking</h3>
            <ol className="timeline"><li className="timeline-item done"><div className="timeline-marker"><CircleCheck size={20} /></div><div className="timeline-content"><strong>Last saved in SevaPath</strong><p><time dateTime={draft.updated_at}>{new Date(draft.updated_at).toLocaleString()}</time></p></div></li></ol>
          </> : <EmptyState title="Draft preview">Your saved complaint and local activity will appear here.</EmptyState>}
        </section>
        <aside className="card panel info-panel">
          <span className="tile-icon accent-amber"><Landmark size={23} /></span>
          <h2>Official portal handoff</h2><Milestone>Guided handoff to the relevant grievance portal is planned for a later version.</Milestone>
        </aside>
      </div>
    </div>
  )
}
