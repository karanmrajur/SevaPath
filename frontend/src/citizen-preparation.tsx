import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import type { ScanCatalogueEntry, ServiceSource } from './api'
import { useCitizen } from './citizen-context'
import { ConnectionError, Loading, Notice, Progress, StatusBadge } from './components'
import { fields, type FamilyProfile, type ReviewData } from './document-consistency-engine'
import { derivedAge, indiaToday, normalizedDate, type ConfirmedDocument, type EligibilityFacts } from './document-scan-engine'
import { expiryState, findOpportunities, openReviews, preflight, preparationSteps, type Interest, type PreparationStep } from './citizen-preparation-engine'
import { loadPreparationCatalogue, loadPreparationDependencies, loadPreparationDocuments, loadPreparationService } from './preparation-catalogue'
import { useApi } from './use-api'
import './citizen-preparation.css'

const interests: Record<Interest, string> = {
  all: 'All services', education: 'Student and scholarships', farmers: 'Farmer', seniors: 'Senior citizen', families: 'Parent or guardian',
}

const labels = {
  eligible: 'Known requirements satisfied',
  potentially_eligible: 'Potentially eligible · verification needed',
  insufficient_information: 'Missing information',
  not_eligible: 'Known requirement not satisfied',
}

export function PreparationSource({ source }: { source: ServiceSource }) {
  return <span className="metadata"><a className="text-link" href={source.source_url} target="_blank" rel="noreferrer">{source.source_title}</a>
    {' · '}{source.source_type.replaceAll('_', ' ')}{' · '}
    {source.checked_at ? <>Checked <time dateTime={source.checked_at}>{source.checked_at.slice(0, 10)}</time></> : 'Check date unavailable'}
  </span>
}

function CacheNotice({ saved }: { saved: string }) {
  return <Notice>Saved public catalogue from <time dateTime={saved}>{new Date(saved).toLocaleDateString()}</time>. Requirements may have changed.</Notice>
}

function DependencyBranch({ slug, ancestors = [] }: { slug: string; ancestors?: string[] }) {
  const dependencies = useApi(loadPreparationDependencies, slug)
  const documents = useApi(loadPreparationDocuments, slug)
  return <div className="section-stack">
    {documents.loading && <Loading />}
    {documents.error != null && <ConnectionError error={documents.error} retry={documents.retry} />}
    {documents.data?.cached && <CacheNotice saved={documents.data.saved} />}
    {!!documents.data?.data.items.length && <ul className="preparation-tree">
      {documents.data.data.items.map(item => <li key={item.id}>{item.document_name} · {item.required_status}<br /><PreparationSource source={item.source} /></li>)}
    </ul>}
    <DependencyList state={dependencies} ancestors={[...ancestors, slug]} />
  </div>
}

function DependencyList({ state, ancestors }: { state: ReturnType<typeof useApi<Awaited<ReturnType<typeof loadPreparationDependencies>>>>; ancestors: string[] }) {
  const [expanded, setExpanded] = useState<number[]>([])
  const snapshot = state.data
  if (state.loading) return <Loading />
  if (state.error != null) return <ConnectionError error={state.error} retry={state.retry} />
  if (!snapshot) return null
  return <div className="section-stack">
    {snapshot.cached && <CacheNotice saved={snapshot.saved} />}
    {snapshot.data.items.length ? <ul className="preparation-tree">
      {snapshot.data.items.map(({ id, prerequisite_service: service, condition, source }) => <li key={id}>
        <details onToggle={event => {
          const open = event.currentTarget.open
          setExpanded(current => open ? [...current.filter(item => item !== id), id] : current.filter(item => item !== id))
        }}>
          <summary>{service.name}{condition ? ' · Conditional' : ''}</summary>
          <p>{condition ?? 'Published prerequisite'} · Completion needs your review</p>
          <PreparationSource source={source} />
          <p><Link className="text-link" to={'/dashboard/services/' + service.slug}>Open prerequisite details</Link></p>
          {expanded.includes(id) && (ancestors.includes(service.slug) || ancestors.length >= 4
            ? <p>Open the service details to inspect further requirements.</p>
            : <DependencyBranch slug={service.slug} ancestors={ancestors} />)}
        </details>
      </li>)}
    </ul> : <p>The catalogue has no verified prerequisite entries for this service. Review the official instructions.</p>}
  </div>
}

function downloadChecklist(name: string, lines: string[]) {
  const url = URL.createObjectURL(new Blob([[name, '', ...lines].join('\n')], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'sevapath-application-checklist.txt'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Opportunity = ReturnType<typeof findOpportunities>[number]

function ActionPlan({ opportunity, reviewCount, steps, update, busy, cached }: {
  opportunity: Opportunity; reviewCount: number; steps: PreparationStep[];
  update: (steps: PreparationStep[]) => void; busy: boolean; cached: boolean
}) {
  const { entry, assessment } = opportunity
  const { service } = entry
  const details = useApi(loadPreparationService, service.slug)
  const dependencies = useApi(loadPreparationDependencies, service.slug)
  const prerequisites = dependencies.data?.data.items ?? []
  const prerequisiteStep = (id: number): PreparationStep => `prerequisite:${id}`
  const setStep = (step: PreparationStep, complete: boolean) =>
    update(complete ? [...steps, step] : steps.filter(item => item !== step))
  const result = preflight(assessment, { openReviews: reviewCount, steps, partial: entry.partial_rule_coverage,
    currentCatalogue: !cached && details.data?.cached === false,
    dependenciesChecked: dependencies.data?.cached === false,
    dependenciesPending: prerequisites.filter(item => !steps.includes(prerequisiteStep(item.id))).length })
  const catalogue = details.data?.data.catalogue
  const official = details.data && (catalogue ? catalogue.official_application_url : service.official_url)
  const information = catalogue?.official_information_url
  return <section className="section-stack" id="action-plan" aria-label="Application action plan">
    <div className="section-heading"><h3>Action plan for {service.name}</h3><StatusBadge>{result.status}</StatusBadge></div>
    <p>Readiness covers documented requirements and your preparation checks. The issuing authority decides eligibility and application outcomes.</p>
    <div className="readiness-overview">
      {assessment.percentage !== null && <div className="readiness-ring" aria-hidden="true"
        style={{ background: 'conic-gradient(var(--color-civic-green) ' + assessment.percentage + '%, #e3ebf4 0)' }}><span>{assessment.percentage}%</span></div>}
      <div><strong>{assessment.percentage === null
        ? assessment.requirements.length ? 'No verified unconditional requirements to score' : 'Verified document requirements unavailable'
        : assessment.ready + ' of ' + assessment.required + ' verified required document items ready'}</strong>
        <p>Only unconditional required items count. Expired or unresolved items do not count as ready.</p></div>
    </div>
    <p>Preparation checklist progress · {result.progress}%</p>
    <Progress value={result.progress} label="Application preparation" />
    <ol className="citizen-flow">{preparationSteps.map(([step, text]) => <li key={step}><label className="inline-check">
      <input type="checkbox" checked={steps.includes(step)} disabled={busy} onChange={event =>
        setStep(step, event.target.checked)} />{text}</label>
    </li>)}</ol>
    {!!reviewCount && <p>{reviewCount} wallet {reviewCount === 1 ? 'issue needs' : 'issues need'} review. <a className="text-link" href="#document-reviews">Review document conflicts</a></p>}
    <details open><summary>Document dependency checklist</summary>
      {assessment.requirements.length ? <ul className="preparation-tree">{assessment.requirements.map(({ state, requirement, conflicts }) =>
        <li key={requirement.id}><details><summary>{requirement.document_name} · {state === 'ready' ? 'Available' : state} · {requirement.required_status}</summary>
          {conflicts.length > 0 && <p>{conflicts.join(', ')}</p>}
          <p>{state === 'ready' ? 'Citizen-confirmed scan. Check the issuing authority’s requirements.'
            : 'Review the source for accepted evidence and how to obtain it.'}</p>
          <PreparationSource source={requirement.source} />
        </details></li>)}</ul> : <p>Verified document requirements are unavailable.</p>}
    </details>
    <details><summary>Prerequisite services ({prerequisites.length})</summary>
      <DependencyList key={service.slug} state={dependencies} ancestors={[service.slug]} />
      {prerequisites.map(item => <label className="inline-check" key={item.id}>
        <input type="checkbox" checked={steps.includes(prerequisiteStep(item.id))} disabled={busy}
          onChange={event => setStep(prerequisiteStep(item.id), event.target.checked)} />
        {item.prerequisite_service.name} · completed or confirmed with the authority as inapplicable
      </label>)}
    </details>
    {details.error != null && <ConnectionError error={details.error} retry={details.retry} />}
    {details.data?.cached && <CacheNotice saved={details.data.saved} />}
    <p>Application deadline · {catalogue?.application_deadline ?? 'No verified deadline in the catalogue'}</p>
    <div className="button-row">
      {official && <a className="text-link" href={official} target="_blank" rel="noreferrer">Official portal</a>}
      {information && information !== official && <a className="text-link" href={information} target="_blank" rel="noreferrer">Official information</a>}
      <Link className="text-link" to={'/dashboard/planner?' + new URLSearchParams({ service: service.slug })}>Open saved journeys</Link>
      <Link className="text-link" to="/dashboard/centres">Find nearby service centres</Link>
      <button className="button button-outline" type="button" onClick={() => downloadChecklist(service.name, [
        'Public checklist. Check current requirements with the issuing authority.',
        ...[official, information].filter((url): url is string => !!url),
        ...assessment.requirements.map(({ requirement }) => requirement.document_name + ' (' + requirement.required_status + ') — ' + requirement.source.source_url),
        ...(dependencies.data?.data.items ?? []).map(item => item.prerequisite_service.name + ' — ' + item.source.source_url),
        ...preparationSteps.map(([, text]) => text),
      ])}>Download public checklist</button>
    </div>
  </section>
}

function FamilyDiscovery({ profiles, entries, update, busy }: {
  profiles: FamilyProfile[]; entries: ScanCatalogueEntry[];
  update: (profiles: FamilyProfile[]) => void; busy: boolean
}) {
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (profiles.length >= 8 || busy) return
    const input = new FormData(event.currentTarget)
    const raw = String(input.get('age') ?? '')
    const age = raw === '' ? undefined : Number(raw)
    if (age !== undefined && (!Number.isInteger(age) || age < 0 || age > 125)) return
    update([...profiles, { id: crypto.randomUUID(), interest: input.get('role') as Interest, age }])
    event.currentTarget.reset()
  }
  return <details className="section-stack"><summary>Family Benefit Discovery</summary>
    <p>Use this person's permission, or add a dependent you are authorized to represent. Only their chosen role and optional age are used. Your own wallet scans are kept separate.</p>
    {profiles.length < 8 && <form className="section-stack" onSubmit={add}>
      <div className="citizen-two"><label>Family member role<select name="role" defaultValue="education">
        {Object.entries(interests).map(([key, title]) => <option key={key} value={key}>{key === 'all' ? 'Other role' : title}</option>)}
      </select></label>
      <label>Age in completed years (optional)<input name="age" type="number" min="0" max="125" step="1" /></label></div>
      <label className="inline-check"><input required type="checkbox" /> I have consent or am authorized to act on this person's behalf.</label>
      <button type="submit" className="button button-outline" disabled={busy}>Add family profile on this device</button>
    </form>}
    {profiles.map((profile, index) => <details key={profile.id}>
      <summary>Family profile {index + 1} · {profile.interest === 'all' ? 'Other role' : interests[profile.interest]}</summary>
      <p>{profile.age === undefined ? 'Age not provided' : 'Confirmed age: ' + profile.age} · Document readiness unavailable for this profile</p>
      <ul className="citizen-link-list">{findOpportunities(entries, [], profile.interest, { age: profile.age }).slice(0, 5).map(({ entry, assessment }) =>
        <li key={entry.service.slug}><Link className="text-link" to={'/dashboard/services/' + entry.service.slug}>{entry.service.name}</Link>
          {' · '}{labels[assessment.status]}</li>)}</ul>
      <button type="button" className="button button-outline" disabled={busy}
        onClick={() => update(profiles.filter(item => item.id !== profile.id))}>Remove this family profile</button>
    </details>)}
  </details>
}

export function CitizenPreparation({ data, documents, conflictFields, save, busy }: {
  data: ReviewData; documents: ConfirmedDocument[]; conflictFields: ReadonlySet<string>;
  save: (data: ReviewData) => Promise<boolean>; busy: boolean
}) {
  const catalogue = useApi(loadPreparationCatalogue)
  const { citizen: { profile } } = useCitizen()
  const [useProfile, setUseProfile] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [interest, setInterest] = useState<Interest>('all')
  const [search] = useSearchParams()
  const { hash } = useLocation()
  const [selected, setSelected] = useState(search.get('service') ?? '')
  const [view, setView] = useState(() => search.get('view') === 'passport' ? 'passport' : 'radar')
  useEffect(() => {
    if (hash === '#local-preparation') document.getElementById('local-preparation')?.scrollIntoView()
  }, [hash, search])
  const reviews = useMemo(() => openReviews(data), [data])
  const entries = catalogue.data?.data
  const opportunities = useMemo(() => {
    const age = profile.age ?? derivedAge(normalizedDate(profile.date_of_birth ?? ''), indiaToday())
    const facts: EligibilityFacts | undefined = useProfile ? {
      age: conflictFields.has('age') || age === '' ? undefined : Number(age),
      landholding: conflictFields.has('landholding') ? undefined : profile.landholding ?? undefined,
      gruha_lakshmi_household_head: conflictFields.has('gruha_lakshmi_household_head') ? undefined : profile.gruha_lakshmi_household_head ?? undefined,
    } : undefined
    return entries ? findOpportunities(entries, documents, interest, facts, useProfile ? profile.state.trim() : undefined) : []
  }, [entries, documents, interest, profile, conflictFields, useProfile])
  const opportunity = opportunities.find(item => item.entry.service.slug === selected) ?? opportunities[0]
  const plan = data.preparation?.plans ?? {}
  const days = data.preparation?.reminderDays ?? 30
  const update = (change: Partial<NonNullable<ReviewData['preparation']>>) => void save({
    ...data, preparation: { ...data.preparation, ...change },
  })

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine)
      if (navigator.onLine) catalogue.retry()
    }
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [catalogue.retry])

  useEffect(() => {
    const next = search.get('view')
    if (next === 'passport' || next === 'radar') setView(next)
    if (search.has('service')) setSelected(search.get('service') ?? '')
  }, [search])

  return <section className="card panel section-stack" id="local-preparation" aria-label="Local application preparation">
    <div className="section-heading"><h2>Pre-Rejection Shield</h2><StatusBadge>{online ? 'Online' : 'Offline'}</StatusBadge></div>
    <p>Use your reviewed documents to spot application gaps. Your scan values and checklist progress stay on this device.</p>
    <div className="button-row">
      <button className="button button-outline" type="button" aria-pressed={view === 'radar'} onClick={() => setView('radar')}>Benefit Radar</button>
      <button className="button button-outline" type="button" aria-pressed={view === 'passport'} onClick={() => setView('passport')}>Eligibility Passport</button>
    </div>
    {view === 'passport' && <section className="section-stack" aria-label="Eligibility Passport">
      <h3>Eligibility Passport</h3>
      <p>{documents.length} confirmed {documents.length === 1 ? 'document' : 'documents'} · {reviews.length} open review {reviews.length === 1 ? 'item' : 'items'}</p>
      <p>Locally available eligibility facts: {([['age', 'Age'], ['landholding', 'Landholding'], ['gruha_lakshmi_household_head', 'Household head']] as const)
        .filter(([fact]) => documents.some(document => document[fact] !== undefined && !document.confirmationPending))
        .map(([, label]) => label).join(', ') || 'None yet'}.</p>
      {!!reviews.length && <p>Needs review: {[...new Set(reviews.map(item => fields[item.field]))].join(', ')}.</p>}
      <label>Show expiry reminders within<select value={days} disabled={busy} onChange={event => update({ reminderDays: Number(event.target.value) })}>
        {[7, 14, 30, 60, 90].map(window => <option key={window} value={window}>{window} days</option>)}
      </select></label>
      <p className="metadata">Reminders appear here while the wallet is open.</p>
      <FamilyDiscovery profiles={data.preparation?.family ?? []} entries={entries ?? []}
        update={family => update({ family })} busy={busy} />
      {documents.length > 0 && <ul className="citizen-link-list">{documents.map((document, index) => <li key={index}>
        {document.type} · {expiryState(document, days)}{document.expiresOn && <> · <time dateTime={document.expiresOn}>{document.expiresOn}</time></>}
      </li>)}</ul>}
    </section>}
    {catalogue.loading && <Loading />}
    {catalogue.error != null && <ConnectionError error={catalogue.error} retry={catalogue.retry} />}
    {catalogue.data?.cached && <CacheNotice saved={catalogue.data.saved} />}
    {entries && <>
      <h3>Benefit Radar</h3>
      <label className="inline-check"><input type="checkbox" checked={useProfile}
        onChange={event => setUseProfile(event.target.checked)} /> Include my profile’s state and supported eligibility facts in this local check</label>
      <div className="citizen-two">
        <label>Interests<select aria-label="Interests" value={interest} onChange={event => setInterest(event.target.value as Interest)}>
          {Object.entries(interests).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Scheme for your action plan<select value={opportunity?.entry.service.slug ?? ''} disabled={!opportunity}
          onChange={event => setSelected(event.target.value)}>
          {!opportunity && <option value="">No verified entries in this category</option>}
          {opportunities.map(({ entry }) => <option key={entry.service.slug} value={entry.service.slug}>{entry.service.name}</option>)}
        </select></label>
      </div>
      {opportunity && <>
        <details><summary>Ranked catalogue opportunities</summary>
          <ul className="citizen-link-list">{opportunities.map(({ entry, assessment }) => <li key={entry.service.slug}>
            <button className="text-link" type="button" onClick={() => setSelected(entry.service.slug)}>{entry.service.name}</button>
            {' · '}{labels[assessment.status]}{assessment.required > assessment.ready
              && (' · ' + (assessment.required - assessment.ready) + ' required items still need action')}
          </li>)}</ul>
        </details>
        <p>{labels[opportunity.assessment.status]} · {opportunity.assessment.matched.length} matched, {opportunity.assessment.failed.length} failed, {opportunity.assessment.unknown.length} unknown configured conditions.</p>
        <p className="metadata">{interest !== 'all' ? 'Shown because the catalogue topic matches your selected interest. ' : ''}
          {opportunity.entry.partial_rule_coverage ? 'The rule set is partial. ' : ''}
          {opportunity.assessment.checks.length ? 'Review the sourced conditions below.' : 'No verified machine-readable rules are available for this entry.'}</p>
        {!!opportunity.assessment.checks.length && <details><summary>Eligibility conditions and evidence</summary>
          <ul className="citizen-link-list">{opportunity.assessment.checks.map(({ rule, status }, index) => <li key={index}>
            {status} · {rule.explanation}<br /><PreparationSource source={rule.source} />
          </li>)}</ul>
        </details>}
        <ActionPlan key={opportunity.entry.service.slug} opportunity={opportunity} reviewCount={reviews.length}
          steps={plan[opportunity.entry.service.slug] ?? []} busy={busy} cached={catalogue.data?.cached === true}
          update={steps => update({ plans: { ...plan, [opportunity.entry.service.slug]: steps } })} />
      </>}
    </>}
  </section>
}
