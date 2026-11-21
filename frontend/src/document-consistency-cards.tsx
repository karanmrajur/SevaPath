import { useState, type FormEvent } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Progress, StatusBadge } from './components'
import { activeRecords, comparedValue, comparisons, evidenceField, fields, latestDecision, nameDifference, safeValue, type Comparison, type Decision, type ReviewData, type ScanRecord } from './document-consistency-engine'

const labels = {
  MATCH: 'EXACT MATCH', POSSIBLE_MATCH: 'POSSIBLE MATCH — REVIEW REQUIRED', MISMATCH: 'MISMATCH DETECTED',
  MISSING_INFORMATION: 'NOT EXTRACTED', UNVERIFIED: 'LOW CONFIDENCE — REVIEW REQUIRED',
}

const uidai = 'https://uidai.gov.in/en/updating-data-on-aadhaar'

export function recordLabel(record: ScanRecord) {
  return record.type + ' · ' + new Date(record.confirmedAt).toLocaleString('en-IN')
}

function Resolution({ group, addDecision, busy }: { group: Comparison; addDecision: (decision: Decision) => void; busy: boolean }) {
  const [action, setAction] = useState('')
  const [manual, setManual] = useState('')
  const [error, setError] = useState('')
  const possible = group.records.filter(record => comparedValue(group, record))
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = possible.find(record => record.id === action)
    const value = action === 'manual' ? safeValue(group.field, manual) : selected ? comparedValue(group, selected) : undefined
    if (action !== 'both' && action !== 'later' && !value) {
      setError('Choose a valid value for this field. Leave identity numbers out of the review.')
      return
    }
    setError('')
    addDecision({
      key: group.key, field: group.field, sources: group.records.map(record => record.id),
      action: selected ? 'select' : action as 'manual' | 'both' | 'later', selectedSource: selected?.id, value,
      confirmedAt: new Date().toISOString(), status: value ? 'user_confirmed' : 'unverified',
    })
  }
  return <form className="section-stack" onSubmit={submit}>
    <label>Resolution for {fields[group.field]}<select required value={action} onChange={event => setAction(event.target.value)}>
      <option value="">Choose how to handle this difference</option>
      {possible.map(record => <option value={record.id} key={record.id}>Confirm {record.type} value{possible.filter(other => other.type === record.type).length > 1 ? ' · ' + new Date(record.confirmedAt).toLocaleString('en-IN') : ''}</option>)}
      <option value="manual">Enter correct value manually</option><option value="both">Both values may be valid</option>
      <option value="later">Review later</option>
    </select></label>
    {action === 'manual' && <label>Correct {fields[group.field]}<input value={manual} maxLength={240} autoComplete="off" required onChange={event => setManual(event.target.value)} /></label>}
    {error && <p role="alert">{error}</p>}
    <button className="button button-outline" disabled={busy || !action}>Save decision</button>
  </form>
}

export function ComparisonCard({ group, decision, addDecision, onRescan, busy = false }: {
  group: Comparison; decision?: Decision; addDecision?: (decision: Decision) => void; onRescan?: (record: ScanRecord) => void; busy?: boolean
}) {
  const discrepancy = group.status === 'MISMATCH' || group.status === 'POSSIBLE_MATCH' || group.status === 'UNVERIFIED'
  const label = group.nameReview?.reason === 'cross-script' && group.status === 'UNVERIFIED'
    ? 'CROSS-SCRIPT REVIEW REQUIRED' : labels[group.status]
  return <article className={'card panel section-stack consistency-card' + (group.status === 'MISMATCH' ? ' consistency-mismatch' : '')}>
    <div className="section-heading"><h3>{fields[group.field]}</h3>
      <span className={group.status === 'MISMATCH' ? 'consistency-alert' : undefined}>
        {group.status === 'MISMATCH' ? <><TriangleAlert size={16} aria-hidden="true" /> {label}</>
          : <StatusBadge tone={group.status === 'MATCH' ? 'green' : discrepancy ? 'amber' : 'neutral'}>{label}</StatusBadge>}
      </span>
    </div>
    {group.field === 'name' && group.status !== 'MATCH' && <p className="consistency-review-status">
      {decision?.value ? 'Review recorded' : 'REVIEW REQUIRED'}
      {group.status === 'MISSING_INFORMATION' && ' — a full name is missing from a scan.'}
    </p>}
    {group.nameReview?.reason === 'name-spelling' && <p>The names contain a spelling or formatting difference.</p>}
    {group.nameReview?.reason === 'cross-script' && <p>These names use different or mixed scripts. Review the spelling on each document.
      {group.nameReview.score !== undefined && <> Candidate similarity {group.nameReview.score}%.</>}</p>}
    <dl className="citizen-two">
      {group.records.map(record => {
        const evidenceKey = evidenceField(record, group.field)
        const OCR = record.evidence[evidenceKey]
        const name = group.comparedNames?.[record.id]
        const value = comparedValue(group, record)
        const alternative = group.status === 'MISMATCH' && group.field === 'name'
          ? group.records.map(item => comparedValue(group, item)).find(other => other && other !== value) : undefined
        const diff = value && alternative ? nameDifference(value, alternative) : undefined
        const evidence = [...(OCR ? [OCR, ...(OCR.alternates ?? [])] : []),
          ...(group.field === 'name' ? record.nameCandidates ?? [] : [])]
        return <div key={record.id}><dt><strong>{recordLabel(record)}</strong></dt>
          <dd className={group.field === 'name' ? 'consistency-name-value' : undefined}>
            <bdi>{diff ? <>{diff[0]}{diff[1] && <mark className="consistency-name-change">{diff[1]}</mark>}{diff[2]}</>
              : value ?? 'No value provided'}</bdi>
          </dd>
          {group.field === 'name' && <dd className="metadata">OCR confidence: {name?.confidence != null ? name.confidence + '%' : 'unavailable for this value'}</dd>}
          {evidence.length > 0 && <dd><details><summary>View original OCR evidence</summary>
            {evidence.map((entry, index) => <p className="metadata" key={index}>
              Original OCR{evidenceKey !== group.field && ' (' + fields[evidenceKey] + ')'}: <bdi>{entry.value}</bdi> · {entry.confidence === null ? 'confidence unavailable' : entry.confidence + '% OCR line confidence'}
            </p>)}
          </details></dd>}
          {onRescan && group.field === 'name' && group.status !== 'MATCH' && <dd>
            <button type="button" className="button button-outline" disabled={busy} onClick={() => onRescan(record)}
              aria-label={'Rescan ' + record.type}>Rescan document</button>
          </dd>}
        </div>
      })}
    </dl>
    {discrepancy && <p>Check the highlighted field on each document. If a document contains an error, use its issuing authority’s correction process.
      {group.records.some(record => record.type === 'Aadhaar Card') && <> <a className="text-link" href={uidai} target="_blank" rel="noreferrer">UIDAI Aadhaar update guidance</a></>}
    </p>}
    {decision && <p>{decision.status === 'user_confirmed' ? 'User-confirmed value: ' + decision.value : decision.action === 'both'
      ? 'Both values may be valid. The field remains unresolved.' : 'Marked for later review.'}</p>}
    {decision?.value && <p className="metadata">This decision is saved in SevaPath. The original OCR evidence and official documents are unchanged.</p>}
    {discrepancy && addDecision && <Resolution group={group} addDecision={addDecision} busy={busy} />}
  </article>
}

export function ConsistencySummary({ data, addDecision, busy, recheck, onRescan }: {
  data: ReviewData; addDecision: (decision: Decision) => void; busy: boolean; recheck: () => void; onRescan: (record: ScanRecord) => void
}) {
  const groups = comparisons(data.records)
  const diffs = groups.filter(group => group.status === 'MISMATCH' || group.status === 'POSSIBLE_MATCH' || group.status === 'UNVERIFIED')
  const unresolved = diffs.filter(group => !latestDecision(data, group.key)?.value)
  const resolved = diffs.length - unresolved.length
  const count = (status: Comparison['status']) => groups.filter(group => group.status === status).length
  return <section className="card panel section-stack" aria-label="Consistency overview">
    <div className="section-heading"><h2>Consistency overview</h2>
      <button type="button" className="button button-outline" onClick={recheck} disabled={!data.records.length || busy}>Recheck All Documents</button>
    </div>
    <p role="status">{unresolved.filter(item => item.status === 'MISMATCH').length} unresolved document mismatches</p>
    {unresolved.some(item => item.field === 'name' && item.status === 'MISMATCH') && <p role="alert" className="consistency-alert">
      DOCUMENT MISMATCH DETECTED — Full Name
    </p>}
    {groups.some(group => group.field === 'name' && group.status === 'MISSING_INFORMATION')
      && <p role="status" className="consistency-review-status">REVIEW REQUIRED — a full name is missing from a confirmed scan.</p>}
    <dl className="citizen-two consistency-counts">
      <div><dt>Total documents scanned</dt><dd>{data.records.length}</dd></div>
      <div><dt>Matching fields</dt><dd>{count('MATCH')}</dd></div>
      <div><dt>Potential mismatches</dt><dd>{count('POSSIBLE_MATCH')}</dd></div>
      <div><dt>Confirmed mismatches</dt><dd>{diffs.filter(group => group.status === 'MISMATCH' && latestDecision(data, group.key)?.value).length}</dd></div>
      <div><dt>Unresolved fields</dt><dd>{unresolved.length + count('MISSING_INFORMATION')}</dd></div>
    </dl>
    {diffs.length > 0 && <><p>{resolved} of {diffs.length} flagged comparisons have a confirmed value.</p>
      <Progress value={100 * resolved / diffs.length} label="Flagged comparisons with a confirmed value" /></>}
    {data.records.length < 2 && <p>Confirm two scans of documents about you to compare available fields.</p>}
    {diffs.map(group => <ComparisonCard key={group.key} group={group} decision={latestDecision(data, group.key)} addDecision={addDecision} onRescan={onRescan} busy={busy} />)}
    {groups.filter(group => group.field === 'name' && group.status === 'MISSING_INFORMATION')
      .map(group => <ComparisonCard key={group.key} group={group} onRescan={onRescan} busy={busy} />)}
    {groups.some(group => group.status === 'MATCH' || group.status === 'MISSING_INFORMATION' && group.field !== 'name') && <details>
      <summary>Matched fields and missing information</summary>
      {groups.filter(group => group.status === 'MATCH' || group.status === 'MISSING_INFORMATION' && group.field !== 'name').map(group => <ComparisonCard key={group.key} group={group} />)}
    </details>}
    {activeRecords(data.records).length < data.records.length && <details>
      <summary>Previous scan evidence</summary>
      {data.records.filter(record => !activeRecords(data.records).includes(record)).map(record => <div key={record.id}>
        <h3>{recordLabel(record)}</h3>
        <ul>{Object.entries(record.evidence).map(([field, entry]) => <li key={field}>
          {fields[field as keyof typeof fields]} · <bdi>{entry?.value}</bdi> · {entry?.confidence ?? 'unknown'} OCR confidence
        </li>)}</ul>
      </div>)}
    </details>}
    <details>
      <summary>Review history ({data.decisions.length})</summary>
      {data.decisions.length ? <ol className="section-stack">{data.decisions.slice().reverse().map((decision, index) => <li key={index}>
        <strong>{fields[decision.field]}</strong> · <time dateTime={decision.confirmedAt}>{new Date(decision.confirmedAt).toLocaleString('en-IN')}</time>
        <p>{decision.status === 'user_confirmed' ? 'User-confirmed value: ' + decision.value
          : decision.action === 'both' ? 'Both may be valid · unverified' : 'Verify later · unverified'}</p>
        {decision.sources.map(id => {
          const source = data.records.find(record => record.id === id)
          if (!source) return null
          const original = source.evidence[evidenceField(source, decision.field)]
          return <p key={id}>{recordLabel(source)}{decision.selectedSource === id && ' · selected source'} · {original
            ? 'Original OCR: ' + original.value + ' · ' + (original.confidence === null ? 'confidence unavailable' : original.confidence + '% OCR line confidence')
            : 'No OCR value captured'}</p>
        })}
      </li>)}</ol> : <p>Decisions appear here after you review a difference.</p>}
    </details>
  </section>
}
