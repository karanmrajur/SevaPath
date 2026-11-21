import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api, type ServiceSource } from './api'
import { assessScan, type ConfirmedDocument, type Status } from './document-scan-engine'
import { ConnectionError, EmptyState, Loading, Progress, StatusBadge } from './components'
import { useApi } from './use-api'

const labels: Record<Status, string> = {
  eligible: 'Eligible on configured rules',
  potentially_eligible: 'Potentially eligible',
  not_eligible: 'Not eligible on configured rules',
  insufficient_information: 'Insufficient information',
}

function SourceLink({ source }: { source: ServiceSource }) {
  return <span className="metadata"><a className="text-link" href={source.source_url} target="_blank" rel="noreferrer">{source.source_title}</a>
    {source.checked_at && <> · Verified <time dateTime={source.checked_at}>{source.checked_at.slice(0, 10)}</time></>}
  </span>
}

export function DocumentScanResults({ documents, previousDocuments, conflictFields }: {
  documents: ConfirmedDocument[]; previousDocuments?: ConfirmedDocument[]; conflictFields?: ReadonlySet<string>
}) {
  const catalogue = useApi(api.scanCatalogue)
  const results = useMemo(() => (catalogue.data ?? []).map(entry => ({ ...entry, assessment: assessScan(entry, documents) })), [catalogue.data, documents])
  const matches = results.filter(item => item.assessment.status === 'eligible' || item.assessment.status === 'potentially_eligible')
  const [filter, setFilter] = useState<'all' | 'matching' | 'failed' | 'unknown'>('all')
  const [selection, setSelection] = useState('')
  const visible = filter === 'matching' ? matches : results.filter(item => filter === 'all'
    || item.assessment.status === (filter === 'failed' ? 'not_eligible' : 'insufficient_information'))
  const current = visible.find(item => item.service.slug === selection) ?? visible[0]
  const assessment = current?.assessment
  const affected = previousDocuments ? results.filter(item => {
    const before = assessScan(item, previousDocuments)
    const after = item.assessment
    return before.status !== after.status || before.ready !== after.ready
      || before.checks.some((check, index) => check.status !== after.checks[index].status)
      || before.requirements.some((requirement, index) => requirement.state !== after.requirements[index].state)
  }) : []

  return <section className="card panel section-stack" aria-label="Local eligibility and readiness">
    <h2>Eligibility and document readiness</h2>
    <p>This assessment uses your confirmed scans in this session and the catalogue’s published rules. Government departments decide applications.</p>
    {catalogue.loading && <Loading />}
    {catalogue.error != null && <ConnectionError error={catalogue.error} retry={catalogue.retry} />}
    {catalogue.data && <>
      {previousDocuments && <details open={affected.length > 0}>
        <summary>Affected schemes and services ({affected.length})</summary>
        {affected.length ? <ul className="citizen-link-list">{affected.map(item => <li key={item.service.slug}>
          <button type="button" className="text-link" onClick={() => { setFilter('all'); setSelection(item.service.slug) }}>{item.service.name}</button>
        </li>)}</ul> : <p>The latest review did not change a configured condition or document requirement.</p>}
      </details>}
      <p role="status">{matches.length} matching {matches.length === 1 ? 'scheme or service' : 'schemes or services'} · {documents.length} confirmed {documents.length === 1 ? 'document' : 'documents'}</p>
      {matches.length > 0 && <div><h3>Matching schemes and services</h3><ul className="citizen-link-list">{matches.map(item => <li key={item.service.slug}>
        <button type="button" className="text-link" onClick={() => { setFilter('matching'); setSelection(item.service.slug) }}>{item.service.name}</button>
        {' · '}{labels[item.assessment.status]}
      </li>)}</ul></div>}
      <div className="citizen-two">
        <label>Assessment filter<select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
          <option value="all">All schemes and services</option><option value="matching">Matching schemes and services</option>
          <option value="failed">Failed conditions</option><option value="unknown">Insufficient information</option>
        </select></label>
        <label>Scheme or service<select value={current?.service.slug ?? ''} disabled={!visible.length} onChange={event => setSelection(event.target.value)}>
          {!visible.length && <option value="">No matching results</option>}
          {visible.map(item => <option key={item.service.slug} value={item.service.slug}>{item.service.name}</option>)}
        </select></label>
      </div>
      {current && assessment ? <div className="section-stack">
        <div className="section-heading"><h3>{current.service.name}</h3><StatusBadge tone={assessment.matched.length && !assessment.failed.length && !assessment.unknown.length ? 'green' : 'neutral'}>{labels[assessment.status]}</StatusBadge></div>
        {current.partial_rule_coverage && <p className="metadata">Configured rules cover only part of this scheme’s eligibility criteria.</p>}
        {([['Matched conditions', assessment.matched], ['Failed conditions', assessment.failed], ['Unknown conditions', assessment.unknown]] as const).map(([label, checks]) => <div key={label}>
          <h4>{label}</h4>
          {checks.length ? <ul className="citizen-link-list">{checks.map(({ rule }, index) => <li key={index}>{rule.explanation}
            {label === 'Unknown conditions' && conflictFields?.has(rule.field) && <p>Conflicting confirmed scan values need review before this condition can be evaluated.</p>}
            <br /><SourceLink source={rule.source} /></li>)}</ul>
            : <p>{label === 'Unknown conditions' && !assessment.checks.length ? 'The catalogue has no verified rules for this scheme.' : 'None among the configured rules.'}</p>}
        </div>)}
        <div className="section-stack"><h4>Document readiness</h4>
          {conflictFields && assessment.required > 0 && <p>Documents recognized: {assessment.requirements.filter(item => item.recognized && item.requirement.required_status === 'required').length}/{assessment.required}
            {' · '}Missing required items: {assessment.requirements.filter(item => item.state === 'missing' && item.requirement.required_status === 'required').length}
            {assessment.requirements.some(item => item.state === 'review' && item.requirement.required_status === 'required') && ' · Readiness: Review required'}</p>}
          {assessment.percentage === null ? <p>Not available. The catalogue has no verified unconditional document requirements for this scheme.</p>
            : <><p>{assessment.percentage}% · {assessment.ready} of {assessment.required} required document items matched a confirmed scan with no recorded past expiry.</p>
              <Progress value={assessment.percentage} label="Document readiness" />
              <p className="metadata">Readiness is matched required items divided by all verified unconditional requirements. Optional and conditional items are excluded. Items requiring manual review remain in the denominator if required.</p></>}
          {([['Documents matched', ['ready']], ['Missing documents', ['missing', 'expired']], ['Documents needing conflict review', ['review']], ['Manual document checks', ['manual']]] as const).map(([label, states]) => {
            const items = assessment.requirements.filter(item => (states as readonly string[]).includes(item.state))
            return <div key={label}><h4>{label}</h4>{items.length ? <ul className="citizen-link-list">{items.map(({ requirement, state, conflicts }) => <li key={requirement.id}>
              {requirement.document_name} · {requirement.required_status}{state === 'expired' && ' · expiry recorded in the past'}
              {conflicts.length > 0 && <p>Unresolved: {conflicts.join(', ')}</p>}
              <br /><SourceLink source={requirement.source} /></li>)}</ul> : <p>None among the published requirements.</p>}</div>
          })}
        </div>
        <Link className="text-link" to={'/dashboard/services/' + current.service.slug}>View catalogue details</Link>
      </div> : <EmptyState title="No schemes in this view">Choose another filter or confirm more documents.</EmptyState>}
    </>}
  </section>
}
