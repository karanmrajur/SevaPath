import { useEffect, useRef } from 'react'
import { Bookmark, Compass, GraduationCap, ShieldCheck } from 'lucide-react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { api, ApiError, type Service } from './api'
import { CatalogueEvidence } from './catalogue-evidence'
import { citizenApi } from './citizen-api'
import { toggleItem, useCitizen } from './citizen-context'
import { CategoryIcon, ConnectionError, EmptyState, Loading, Notice, PageHeader, PortalLink, StatusBadge } from './components'
import { ServiceRequirements } from './service-requirements'
import { useApi } from './use-api'
import { assessmentLabel } from './citizen-journey'
import { profileProgress } from './citizen-profile'
import { CitizenChecklist } from './citizen-records'
import { Progress } from './components'

const directory = [
  ['Pension Services', ['pension', 'old-age', 'widow', 'disability']],
  ['Student Services', ['scholar', 'education', 'student']],
  ['Farmer Services', ['farmer', 'agricultur', 'crop']],
  ['Women Empowerment', ['welfare', 'gruha', 'women', 'maternal']],
  ['Other Essential Services', ['ration card', 'land record', 'income', 'caste', 'residence', 'birth', 'death', 'labour', 'employment', 'disability']],
] as const

function searchable(service: Service) {
  return [service.name, service.description, service.category].join(' ').toLowerCase()
}

export function SaveService({ service }: { service: Service }) {
  const { workspace, saving, save } = useCitizen()
  const saved = workspace.data?.saved.includes(service.slug) ?? false
  return <button type="button" className="button button-outline" aria-pressed={saved} disabled={saving || !workspace.data}
    onClick={() => void save(previous => ({ ...previous, saved: toggleItem(previous.saved, service.slug) }))}><Bookmark size={16} />{saved ? 'Saved to My Journey' : 'Save to My Journey'}</button>
}

function ServiceTile({ service, scholarship = false }: { service: Service; scholarship?: boolean }) {
  return <article className="card panel section-stack">
    <div className="section-heading"><CategoryIcon category={service.category} /><StatusBadge tone="blue">{service.state ?? service.jurisdiction}</StatusBadge></div>
    <div><h3><Link className="citizen-title-link" to={'/dashboard/services/' + service.slug}>{service.name}</Link></h3><p>{service.description}</p></div>
    {scholarship && service.slug === 'scholarships' && <><StatusBadge>Scholarship discovery portal</StatusBadge><p className="metadata">Scheme-specific eligibility, benefit amounts, documents and application dates are available through the official portal when published.</p></>}
    <div className="button-row"><Link className="text-link" to={'/dashboard/services/' + service.slug}>View details</Link><SaveService service={service} /></div>
    {scholarship && <PortalLink service={service} />}
  </article>
}

export function CitizenDirectory({ scholarships = false }: { scholarships?: boolean }) {
  const { catalogue, citizen, workspace } = useCitizen()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const state = params.get('state') ?? ''
  const savedOnly = params.get('saved') === 'yes'
  const services = (catalogue.data ?? []).filter(service => !scholarships || service.subcategory?.toLowerCase().includes('scholarship')
    || searchable(service).includes('scholar'))
  const group = directory.find(([title]) => title === category)
  const filtered = services.filter(service => q.toLowerCase().trim().split(/\s+/u).every(term => searchable(service).includes(term))
    && (!group || group[1].some(term => searchable(service).includes(term)))
    && (!state || (service.state ?? '').toLowerCase() === state)
    && (!savedOnly || workspace.data?.saved.includes(service.slug)))

  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return <div className="page-stack">
    <PageHeader title={scholarships ? 'Scholarships' : 'Services Directory'} description={scholarships
      ? 'Explore published education references for students, parents and guardians.'
      : 'Find real catalogue records and confirm application instructions on the official portal.'} icon={scholarships ? <GraduationCap size={22} /> : <Compass size={22} />} />
    <form className="card panel citizen-filter" aria-label="Filter catalogue" onSubmit={event => event.preventDefault()}>
      <label>Search by name or topic<input type="search" value={q} maxLength={120} onChange={event => filter('q', event.target.value)} /></label>
      <label>State<select value={state} onChange={event => filter('state', event.target.value)}>
        <option value="">All states and central services</option>
        <option value="karnataka">Karnataka</option>
        {Array.from(new Set(services.flatMap(service => service.state && service.state.toLowerCase() !== 'karnataka' ? [service.state] : []))).map(name => <option key={name} value={name.toLowerCase()}>{name}</option>)}
      </select></label>
      {!scholarships && <label>Category<select value={category} onChange={event => filter('category', event.target.value)}><option value="">All categories</option>{directory.map(([title]) => <option key={title}>{title}</option>)}</select></label>}
      <label className="inline-check"><input type="checkbox" checked={savedOnly} onChange={event => filter('saved', event.target.checked ? 'yes' : '')} /> Saved only</label>
    </form>
    {scholarships ? <Notice>Education level, category, income, course, institution type and application-status filters need published scholarship records. {citizen.profile.dependent
      ? 'A consented dependent profile is saved. Review scheme criteria for that student on the official portal.'
      : <Link className="text-link" to="/dashboard/profile">Add an optional dependent profile</Link>}</Notice>
      : <details className="card panel"><summary>Browse available topics</summary><ul className="citizen-topic-list">{directory.map(([title, terms]) => <li key={title}><strong>{title}</strong><p>{terms.join(' · ')}</p></li>)}</ul></details>}
    {catalogue.loading && <Loading />}
    {catalogue.error != null && <ConnectionError error={catalogue.error} retry={catalogue.retry} />}
    {catalogue.data && (filtered.length ? <><p role="status">{filtered.length} catalogue {filtered.length === 1 ? 'result' : 'results'}</p><div className="service-grid">{filtered.map(service => <ServiceTile key={service.slug} service={service} scholarship={scholarships} />)}</div></>
      : <EmptyState title="No published records match" action={<button className="button button-outline" type="button" onClick={() => setParams({})}>Clear filters</button>}>This catalogue only shows available records. Try a different topic.</EmptyState>)}
  </div>
}

export function CitizenServiceDetail() {
  const { serviceId = '' } = useParams()
  const { workspace, saving, save } = useCitizen()
  const { data: service, error, retry } = useApi(api.service, serviceId)
  const seen = useRef('')
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#requirements' && service) document.getElementById('requirements')?.scrollIntoView()
  }, [hash, service])
  const assessment = useApi(citizenApi.eligibility)

  useEffect(() => {
    if (!service || !workspace.data || saving || seen.current === service.slug) return
    seen.current = service.slug
    if (workspace.data.recent[0] !== service.slug) {
      void save(current => ({ ...current, recent: [service.slug, ...current.recent.filter(slug => slug !== service.slug)].slice(0, 10) }))
    }
  }, [service, workspace.data, saving, save])

  if (error instanceof ApiError && error.status === 404) return <EmptyState title="Service unavailable" action={<Link className="text-link" to="/dashboard/services">Back to services</Link>}>This catalogue entry could not be found.</EmptyState>
  if (error != null) return <ConnectionError error={error} retry={retry} />
  if (!service) return <Loading />
  const query = '?' + new URLSearchParams({ service: service.slug })
  const criteria = assessment.data?.find(item => item.slug === service.slug)
  return <div className="page-stack">
    <Link className="text-link" to="/dashboard/services">Back to services</Link>
    <PageHeader title={service.name} description={service.catalogue?.overview ?? service.description} icon={<Compass size={22} />} />
    <section className="card panel section-stack"><h2>Service overview</h2><dl className="details-list">
      <div><dt>Government department</dt><dd>{service.department ?? 'Unavailable in the catalogue'}</dd></div>
      <div><dt>Region</dt><dd>{service.state ?? 'India'}</dd></div>
      <div><dt>Fees and deadlines</dt><dd>Verify current fees and dates on the official portal.</dd></div>
      <div><dt>Application and tracking</dt><dd>Open the official portal for application instructions and status options. Keep the reference you receive there.</dd></div>
      <div><dt>Catalogue verification</dt><dd>{service.last_verified_at ? new Date(service.last_verified_at).toLocaleDateString() : 'No verification date'}</dd></div>
    </dl><div className="button-row"><PortalLink service={service} /><SaveService service={service} /><Link className="button button-outline" to={'/dashboard/eligibility' + query}>Check My Eligibility</Link><Link className="button button-outline" to={'/dashboard/documents' + query}>Prepare Documents</Link><Link className="button button-outline" to={'/dashboard/planner' + query}>Plan next steps</Link><Link className="button button-outline" to={'/dashboard/applications' + query}>Track application</Link></div></section>
    <CatalogueEvidence service={service} />
    <ServiceRequirements slug={service.slug} base="/dashboard" />
    <section className="card panel section-stack"><h2>Eligibility requirements</h2>
      {assessment.loading && <Loading />}
      {assessment.error != null && <ConnectionError error={assessment.error} retry={assessment.retry} />}
      {criteria && (criteria.checks.length ? <ul className="citizen-link-list">{criteria.checks.map((check, index) => <li key={index}><a className="text-link" href={check.source_url} target="_blank" rel="noreferrer">{check.explanation}</a></li>)}</ul> : <p>No verified eligibility rules are configured for this service.</p>)}
      <Link className="text-link" to={'/dashboard/eligibility' + query}>View explainable assessment</Link></section>
    <section className="card panel section-stack"><h2>Sources and guided explanation</h2>{service.sources.length ? <ul className="citizen-link-list">{service.sources.map(source => <li key={source.id}><a className="text-link" href={source.source_url} target="_blank" rel="noreferrer">{source.source_title}</a><span className="metadata"> · {source.source_type.replaceAll('_', ' ')} · {source.checked_at ? <>Checked <time dateTime={source.checked_at}>{source.checked_at.slice(0, 10)}</time></> : 'Source check date unavailable'}</span></li>)}</ul> : <p>No source references are listed.</p>}
      <Link className="text-link" to={'/dashboard/assistant?' + new URLSearchParams({ q: service.name })}>Ask JanSetu about this service</Link></section>
  </div>
}

export function CitizenEligibility() {
  const { catalogue, citizen } = useCitizen()
  const [params] = useSearchParams()
  const selected = params.get('service')
  const assessment = useApi(citizenApi.eligibility, JSON.stringify(citizen.profile))
  const results = assessment.data?.filter(result => !selected || result.slug === selected) ?? []
  const progress = profileProgress(citizen)
  return <div className="page-stack">
    <PageHeader title="Eligible Schemes" description="Review available rules, missing information and recommended next steps." icon={<ShieldCheck size={22} />} />
    <Notice>Assessments use configured, sourced rules and the profile details you choose to share. The percentage measures the share of configured conditions matched. Confirm full eligibility with the relevant department. <Link className="text-link" to="/dashboard/required-details">Edit optional details</Link></Notice>
    <Link className="text-link" to="/dashboard/documents/scan">Check eligibility with private scans</Link>
    <section className="card panel section-stack"><h2>Basic profile completion</h2><p>{progress.percentage}% complete</p><Progress value={progress.percentage} label="Basic profile completion" /></section>
    {selected && <Link className="text-link" to="/dashboard/eligibility">Show all assessments</Link>}
    {(assessment.loading || catalogue.loading) && <Loading />}
    {assessment.error != null && <ConnectionError error={assessment.error} retry={assessment.retry} />}
    {catalogue.error != null && <ConnectionError error={catalogue.error} retry={catalogue.retry} />}
    {assessment.data && catalogue.data && <div className="citizen-two">{results.map(result => {
      const service = catalogue.data?.find(item => item.slug === result.slug)
      if (!service) return null
      return <section className="card panel section-stack" key={result.slug}>
        <div className="section-heading"><h2>{service.name}</h2><StatusBadge tone={result.assessment_state === 'eligible' || result.assessment_state === 'potentially_eligible' ? 'green' : 'neutral'}>{assessmentLabel(result)}</StatusBadge></div>
        {result.total ? <><p>{result.met} matched · {result.unmatched} unmatched · {result.unknown} unknown. Indicative match: {result.match_percentage === null ? 'insufficient profile information' : result.match_percentage + '%'}.</p><ul className="citizen-link-list">{result.checks.map((check, index) => <li key={index}>
          <strong>{check.met === null ? 'Needs official verification · profile information missing' : check.met ? 'Met' : 'Not met'}</strong> · {check.explanation} <a className="text-link" href={check.source_url} target="_blank" rel="noreferrer">Source</a>
        </li>)}</ul></> : <p>Needs official verification. The catalogue has no verified decision rules for this entry.</p>}
        {selected && <CitizenChecklist slug={result.slug} />}
        <Link className="text-link" to={'/dashboard/documents?' + new URLSearchParams({ service: result.slug })}>Check document readiness separately</Link>
        <div className="button-row"><Link className="text-link" to={'/dashboard/services/' + result.slug}>Review service and sources</Link><PortalLink service={service} /></div>
      </section>
    })}{!results.length && <EmptyState title="No services to assess">Open the catalogue when services are available.</EmptyState>}</div>}
  </div>
}

