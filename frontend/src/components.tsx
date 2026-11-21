import { useState, type ReactNode } from 'react'
import { BriefcaseBusiness, Compass, ExternalLink, FileText, GraduationCap, HeartHandshake, Inbox, Info, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'
import { errorMessage, type Service } from './api'

export function Brand() {
  const [available, setAvailable] = useState(__SEVAPATH_HAS_LOGO__)
  return (
    <span className="brand">
      {available
        ? <img className="brand-logo" src={import.meta.env.BASE_URL + 'sevapath-logo.jpeg'} alt="SevaPath" onError={() => setAvailable(false)} />
        : <><span className="brand-emblem" aria-hidden="true">S</span><span className="wordmark">Seva<span>Path</span></span></>}
    </span>
  )
}

export function PageHeader({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return <header className="page-heading"><div className="tile-icon">{icon}</div><div><h1>{title}</h1><p>{description}</p></div></header>
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'blue' }) {
  return <span className={'badge badge-' + tone}>{children}</span>
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="tile-icon"><Inbox size={22} /></div><h2>{title}</h2><p>{children}</p>{action}</div>
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice"><Info size={20} aria-hidden="true" /><div>{children}</div></div>
}

export function Milestone({ children }: { children: ReactNode }) {
  return <div className="milestone"><StatusBadge tone="amber">Coming in next milestone</StatusBadge><p>{children}</p></div>
}

export function Progress({ value, label }: { value: number; label: string }) {
  return <progress className="progress" value={value} max={100} aria-label={label}>{value}%</progress>
}

const categoryIcons = { Employment: BriefcaseBusiness, Education: GraduationCap, Certificates: FileText, Welfare: HeartHandshake }

export function PortalLink({ service }: { service: Service }) {
  if (!service.official_url) return null
  return <a className="button button-primary" href={service.official_url} target="_blank" rel="noopener noreferrer">
    Official portal <ExternalLink size={15} /><span className="sr-only"> (opens in a new tab)</span>
  </a>
}

export function CategoryIcon({ category, size = 20 }: { category: string; size?: number }) {
  const known = Object.hasOwn(categoryIcons, category)
  const Icon = known ? categoryIcons[category as keyof typeof categoryIcons] : Compass
  const tone = known ? ' category-' + category.toLowerCase() : ''
  return <span className={'tile-icon' + tone}><Icon size={size} strokeWidth={1.8} aria-hidden="true" /></span>
}

export function ServiceCard({ service, base, actions = false, children }: { service: Service; base?: string; actions?: boolean; children?: ReactNode }) {
  const scope = base ?? ''
  const detail = scope + '/services/' + service.slug
  const query = '?' + new URLSearchParams({ service: service.slug })
  return (
    <article className="card service-card">
      <div className="card-top">
        <CategoryIcon category={service.category} />
        <StatusBadge tone={service.jurisdiction === 'Central' ? 'blue' : 'green'}>{service.jurisdiction}</StatusBadge>
      </div>
      <div>
        <span className="metadata">{service.browse_category ?? service.category} · {service.state ?? 'India'}</span>
        <h3><Link to={detail}>{service.name}</Link></h3>
        <p>{service.description}</p>
      </div>
      <div className="service-actions">
        <Link className="text-link" to={detail} aria-label={'View details for ' + service.name}>View details</Link>
        {!actions && service.official_url && <a className="icon-button portal-button" href={service.official_url} rel="noopener noreferrer" target="_blank" aria-label={'Official portal for ' + service.name + ' (opens in a new tab)'} title="Open official portal"><ExternalLink size={16} /></a>}
      </div>
      {actions && <div className="button-row">
        <Link className="text-link" to={'/dashboard/eligibility' + query}>Check eligibility</Link>
        <Link className="text-link" to={detail + '#requirements'}>Required documents</Link>
        {service.official_url && <a className="text-link" href={service.official_url} target="_blank" rel="noopener noreferrer">Visit official portal</a>}
        {children}
      </div>}
    </article>
  )
}

export function ConnectionError({ error, retry }: { error: unknown; retry: () => void }) {
  return <EmptyState title="Could not load from SevaPath" action={<button className="button button-outline" onClick={retry}>Retry</button>}>
    <span role="alert">{errorMessage(error)}</span>
  </EmptyState>
}

export function Loading() {
  return <div className="card loading" role="status"><LoaderCircle size={22} aria-hidden="true" /><span>Loading workspace…</span></div>
}
