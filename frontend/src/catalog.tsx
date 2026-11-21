import { useEffect, useRef, type ReactNode } from 'react'
import { Compass, Search } from 'lucide-react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { api, ApiError, type Service } from './api'
import { CatalogueEvidence } from './catalogue-evidence'
import { ConnectionError, EmptyState, Loading, Notice, PageHeader, PortalLink, ServiceCard, StatusBadge } from './components'
import { ServiceRequirements } from './service-requirements'
import { useApi, useServices } from './use-api'

const categories = ['Farmers', 'Students', 'Women Empowerment', 'Pension', 'Certificates', 'Transport', 'Other Citizen Services']
const directoryCategories = ['Farmers', 'Students', 'Scholarships', 'Women Empowerment', 'Pension', 'Certificates', 'Ration Card', 'Land Records', 'Transport Services', 'Other Citizen Services']

export function Catalog({ base = '', saved, renderServiceAction }: { base?: string; saved?: string[]; renderServiceAction?: (service: Service) => ReactNode }) {
  const [params, setParams] = useSearchParams()
  const { hash } = useLocation()
  const searchField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (hash === '#service-search') searchField.current?.focus()
  }, [hash])
  const query = (params.get('q') ?? '').slice(0, 120)
  const category = (params.get('category') ?? '').slice(0, 60)
  const level = params.get('level') ?? ''
  const state = (params.get('state') ?? '').slice(0, 80)
  const page = Number(params.get('page'))
  const filters = new URLSearchParams({ q: query, category, state, page_size: '12' })
  const savedOnly = base === '/dashboard' && params.get('saved') === 'yes'
  if (savedOnly) for (const slug of saved?.length ? saved : ['']) filters.append('slug', slug)
  if (level === 'Central' || level === 'State') filters.set('jurisdiction', level)
  if (Number.isInteger(page) && page > 0 && page <= 100000) filters.set('page', String(page))
  const { data, error, loading, retry } = useServices(filters.toString())

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (key !== 'page') next.delete('page')
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div className="page-stack">
      <PageHeader title="Explore services" description="Find a public service and continue to its official portal." icon={<Compass size={24} />} />
      <div className="card panel filter-bar">
        <label><span>Search services</span><span className="search-field"><Search size={18} /><input ref={searchField} id="service-search" type="search" maxLength={120} value={query} placeholder="Search by name or keyword" onChange={event => changeFilter('q', event.target.value)} /></span></label>
        <label>Category<select value={category} onChange={event => changeFilter('category', event.target.value)}>
          <option value="">All Services</option>{(base ? directoryCategories : categories).map(item => <option key={item} value={item}>{item}</option>)}{category && !(base ? directoryCategories : categories).includes(category) && <option>{category}</option>}
        </select></label>
        <label>Jurisdiction<select value={level} onChange={event => changeFilter('level', event.target.value)}>
          <option value="">Central and State</option><option>Central</option><option>State</option>
        </select></label>
        <label>State<input value={state} maxLength={80} placeholder="Any state" onChange={event => changeFilter('state', event.target.value)} /></label>
        {base === '/dashboard' && <label className="inline-check"><input type="checkbox" checked={savedOnly} onChange={event => changeFilter('saved', event.target.checked ? 'yes' : '')} /> Saved only</label>}
      </div>
      <div className="section-heading">
        <p role="status">{data ? data.total + (data.total === 1 ? ' service' : ' services') : 'Service catalog'}</p>
        <StatusBadge tone="blue">Pilot catalog</StatusBadge>
      </div>
      {loading && <Loading />}
      {error != null && <ConnectionError error={error} retry={retry} />}
      {data && (data.items.length
        ? <div className="service-grid">{data.items.map(service => <ServiceCard key={service.id} service={service} base={base} actions>{renderServiceAction?.(service)}</ServiceCard>)}</div>
        : <EmptyState title="No services match" action={<button className="button button-outline" onClick={() => setParams({})}>Clear filters</button>}>Try a different keyword or reset the filters.</EmptyState>)}
      {data && (data.page > 1 || data.total > data.page_size) && (
        <div className="button-row" aria-label="Catalog pagination">
          <button className="button button-outline" disabled={data.page <= 1} onClick={() => changeFilter('page', String(data.page - 1))}>Previous</button>
          <span>Page {data.page}</span>
          <button className="button button-outline" disabled={data.page * data.page_size >= data.total} onClick={() => changeFilter('page', String(data.page + 1))}>Next</button>
        </div>
      )}
    </div>
  )
}

export function ServiceDetail() {
  const { serviceId = '' } = useParams()
  const { data: service, error, retry } = useApi(api.service, serviceId)
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#requirements' && service) document.getElementById('requirements')?.scrollIntoView()
  }, [hash, service])
  if (error instanceof ApiError && error.status === 404) return <EmptyState title="Service unavailable" action={<Link className="button button-primary" to="/services">Back to services</Link>}>This service is missing from the catalog.</EmptyState>
  if (error != null) return <ConnectionError error={error} retry={retry} />
  if (!service) return <Loading />

  const portal = service.sources.find(source => source.source_url === service.official_url)
  const verifiedOn = service.last_verified_at && new Date(service.last_verified_at).toLocaleDateString(undefined, { timeZone: 'UTC' })

  return (
    <div className="page-stack">
      <Link className="text-link" to="/services">Back to services</Link>
      <PageHeader title={service.name} description={service.catalogue?.overview ?? service.description} icon={<Compass size={24} />} />
      <section className="card panel section-stack">
        <div className="tag-row"><StatusBadge tone={service.verification_status === 'verified' ? 'green' : 'amber'}>{service.verification_status === 'verified' ? 'Catalog entry verified' : 'Unverified entry'}</StatusBadge><StatusBadge>{service.category}</StatusBadge></div>
        <h2>Service information</h2>
        <dl className="details-list">
          <div><dt>Jurisdiction</dt><dd>{service.jurisdiction}</dd></div>
          <div><dt>Region</dt><dd>{service.state ?? 'India'}</dd></div>
          {service.department && <div><dt>Department</dt><dd>{service.department}</dd></div>}
          <div><dt>Official destination</dt><dd>{portal?.source_title ?? (service.official_url ? 'Service portal' : 'Unavailable')}</dd></div>
          {verifiedOn && <div><dt>Catalog entry checked</dt><dd>{verifiedOn}</dd></div>}
        </dl>
        <div className="button-row">
          <PortalLink service={service} />
          <Link className="button button-outline" to={'/dashboard/eligibility?' + new URLSearchParams({ service: service.slug })}>Check My Eligibility</Link>
          <Link className="button button-outline" to={'/dashboard/documents?' + new URLSearchParams({ service: service.slug })}>Prepare Documents</Link>
          <Link className="text-link" to={'/eligibility?' + new URLSearchParams({ service: service.slug })}>Open public eligibility preview</Link>
          <Link className="button button-outline" to={'/dashboard/services/' + service.slug}>Save Scheme in dashboard</Link>
          <Link className="button button-outline" to={'/journeys?' + new URLSearchParams({ service: service.slug })}>Prepare a journey</Link>
        </div>
      </section>
      <section className="card panel section-stack">
        <h2>Sources</h2>
        {service.sources.length > 0
          ? <ul className="section-stack">{service.sources.map(source => <li key={source.id}><a className="text-link" href={source.source_url} target="_blank" rel="noopener noreferrer">{source.source_title}<span className="sr-only"> (opens in a new tab)</span></a><span className="metadata"> · {source.source_type.replaceAll('_', ' ')} · {source.checked_at ? <>Checked <time dateTime={source.checked_at}>{source.checked_at.slice(0, 10)}</time></> : 'Source check date unavailable'}</span></li>)}</ul>
          : <p>Source references are unavailable for this entry.</p>}
      </section>
      <CatalogueEvidence service={service} />
      <ServiceRequirements slug={service.slug} />
      <Notice>Confirm requirements and application instructions with the relevant government department.</Notice>
    </div>
  )
}
