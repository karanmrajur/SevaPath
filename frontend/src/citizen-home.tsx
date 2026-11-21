import { useEffect, useState } from 'react'
import { ArrowUpRight, Bell, Bookmark, ClipboardCheck, FileCheck2, FileText, GraduationCap, History, MessageSquareText, Search, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { api, type Service } from './api'
import { citizenApi, type EligibilityAssessment } from './citizen-api'
import { useCitizen } from './citizen-context'
import { dashboardSearch } from './citizen-layout'
import { MicButton, useMicrophone } from './citizen-voice'
import { CategoryIcon, ConnectionError, EmptyState, Loading, Notice, Progress, StatusBadge } from './components'
import { usePortalPreferences } from './portal-preferences'
import { useApi } from './use-api'
import { assessmentLabel } from './citizen-journey'

const examples = [
  { label: 'Scholarships', query: 'scholarship', icon: GraduationCap },
  { label: 'Pension', query: 'pension', icon: ClipboardCheck },
  { label: 'Ration card', query: 'ration card', icon: FileText },
  { label: 'Land records', query: 'land records', icon: Bookmark },
  { label: 'Grievances', query: 'grievances', icon: MessageSquareText },
]

function HomeSearch() {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [example, setExample] = useState(0)
  const [paused, setPaused] = useState(false)
  const navigate = useNavigate()
  const { language } = usePortalPreferences()
  const mic = useMicrophone(language === 'hi' ? 'hi-IN' : 'en-IN', setValue)

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (paused || focused || value || motion.matches) return
    const timer = window.setInterval(() => setExample(index => (index + 1) % examples.length), 3800)
    const onMotion = () => { if (motion.matches) window.clearInterval(timer) }
    motion.addEventListener('change', onMotion)
    return () => { window.clearInterval(timer); motion.removeEventListener('change', onMotion) }
  }, [focused, paused, value])

  return <div className="card citizen-discover">
    <form className="citizen-home-search" role="search" aria-label="Discover services" onSubmit={event => {
      event.preventDefault()
      navigate(value.toLowerCase().includes('grievance') ? '/dashboard/grievances' : dashboardSearch(value))
    }}>
      <Search size={20} aria-hidden="true" />
      <label className="sr-only" htmlFor="citizen-home-input">What service are you looking for?</label>
      <input id="citizen-home-input" type="search" maxLength={120} value={value} onChange={event => setValue(event.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={'Search for ' + examples[example].label.toLowerCase() + '…'} />
      <MicButton mic={mic} />
      <button className="button button-primary" type="submit">Search</button>
    </form>
    <div className="citizen-examples" aria-label="Example searches">{examples.map(({ label, query, icon: Icon }, index) =>
      <Link key={query} className="chip" data-active={example === index} to={query === 'grievances' ? '/dashboard/grievances' : dashboardSearch(query)}><Icon size={14} aria-hidden="true" />{label}</Link>)}
      <button className="text-link" type="button" onClick={() => setPaused(value => !value)}>{paused ? 'Resume examples' : 'Pause examples'}</button>
    </div>
    <p className="metadata">Voice input may use your browser’s speech provider. Keep personal details out of search.</p>
    {mic.message && <p role="status">{mic.message}</p>}
  </div>
}

export function SchemeRow({ service, assessment }: { service: Service; assessment?: EligibilityAssessment }) {
  const { workspace } = useCitizen()
  const application = workspace.data?.applications[service.slug]
  const requirements = useApi(api.serviceDocuments, service.slug)
  const completion = application ? Math.round(100 * application.tasks.filter(Boolean).length / application.tasks.length) : null
  const missing = requirements.data?.items.filter(item => item.required_status === 'required'
    && workspace.data?.checklist[service.slug + '-' + item.id] === 'missing').length
  const required = requirements.data?.items.filter(item => item.required_status === 'required').length ?? 0

  return <article className="citizen-scheme-row">
    <div className="citizen-list-title"><CategoryIcon category={service.category} /><div><h3>{service.name}</h3><p>{service.department ?? 'Department unavailable'}</p></div></div>
    <div><span className="metadata">Eligibility match</span><p>{assessment?.total ? assessment.met + ' of ' + assessment.total + ' rules met' : 'Unassessed'}</p></div>
    <div><span className="metadata">Application preparation</span>{completion === null ? <p>Not started</p> : <><p>{completion}%</p><Progress value={completion} label="Application preparation" /></>}</div>
    <div><span className="metadata">Application status</span><p>{application ? application.status + ' · User reported' : 'No record'}</p></div>
    <div><span className="metadata">Missing documents</span><p>{required ? (missing || 'None marked missing') : 'Requirements unavailable'}</p></div>
    <Link className="button button-outline" to={application ? '/dashboard/applications?service=' + service.slug : '/dashboard/services/' + service.slug}>{application ? 'Review' : 'Next step'}</Link>
  </article>
}

function SuggestedService({ service, assessment }: { service: Service; assessment?: EligibilityAssessment }) {
  const { walletOpen, inventoryVersion } = useCitizen()
  const readiness = useApi(citizenApi.readiness, service.slug, walletOpen, inventoryVersion)
  const number = readiness.data?.percentage
  return <li>
    <Link to={'/dashboard/services/' + service.slug}>{service.name}<ArrowUpRight size={16} /></Link>
    <p className="metadata">{assessmentLabel(assessment)}{assessment?.match_percentage != null && ' · ' + assessment.match_percentage + '% rule match'}</p>
    <p className="metadata">{walletOpen ? number == null ? 'Document readiness unavailable' : number + '% document readiness' : 'Unlock wallet to check document readiness'}</p>
  </li>
}

export function CitizenHome() {
  const { citizen, catalogue, workspace } = useCitizen()
  const eligibility = useApi(citizenApi.eligibility, JSON.stringify(citizen.profile))
  const journeys = useApi(citizenApi.journeys)
  const grievances = useApi(citizenApi.grievances)
  const services = catalogue.data ?? []
  const state = workspace.data
  const visibleSaved = services.filter(service => state?.saved.includes(service.slug))
  const applications = Object.values(state?.applications ?? {})
  const orderedRecent = state?.recent.flatMap(slug => services.filter(service => service.slug === slug)) ?? []
  const assessments = new Map(eligibility.data?.map(item => [item.slug, item]))
  const suggestions = services.filter(service => !state?.saved.includes(service.slug)
    && assessments.get(service.slug)?.assessment_state !== 'not_eligible'
    && (!citizen.profile.state || !service.state || service.state.toLowerCase() === citizen.profile.state.toLowerCase()))
    .sort((left, right) => (assessments.get(right.slug)?.match_percentage ?? -1) - (assessments.get(left.slug)?.match_percentage ?? -1))
  const activeGrievances = grievances.data?.filter(item => {
    const report = state?.grievances[item.id]
    return report ? ['Submitted', 'In progress', 'Escalated'].includes(report.status) : false
  }).length
  const stats = [
    ['Potential scheme matches', eligibility.data?.some(item => item.total > 0) ? String(eligibility.data.filter(item => item.assessment_state === 'eligible' || item.assessment_state === 'potentially_eligible').length) : '—', 'Verified-rule assessments', ClipboardCheck],
    ['Applications submitted', state ? String(applications.filter(item => item.submission_date && item.status !== 'Preparing').length) : '—', 'User reported', FileText],
    ['Documents ready', state ? String(Object.values(state.checklist).filter(value => value === 'ready').length) : '—', 'Marked ready by you', FileCheck2],
    ['Upcoming deadlines', '—', 'No confirmed dates', Bell],
    ['Pending grievances', activeGrievances === undefined || !state ? '—' : String(activeGrievances), 'User reported', MessageSquareText],
  ] as const
  const activity = [
    ...(journeys.data ?? []).map(journey => ({ key: journey.id, title: 'Journey updated · ' + (services.find(s => s.slug === journey.service_slug)?.name ?? journey.service_slug), date: journey.updated_at })),
    ...(grievances.data ?? []).map(item => ({ key: item.id, title: 'Grievance draft updated · ' + item.title, date: item.updated_at })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)

  return <div className="page-stack">
    <div className="citizen-heading"><div><h1>Welcome, {citizen.name}</h1><p>Discover services and keep your application preparation in one place.</p></div><Link className="button button-outline" to="/dashboard/assistant"><Sparkles size={17} /> Ask JanSetu</Link></div>
    <HomeSearch />
    <div className="citizen-stats">{stats.map(([title, value, note, Icon]) => <article key={title} className="card citizen-stat"><span className="tile-icon"><Icon size={18} /></span><h2>{title}</h2><strong>{value}</strong><p>{note}</p></article>)}</div>
    <section className="card panel section-stack"><div className="section-heading"><h2>My Schemes</h2><Link className="text-link" to="/dashboard/journey">Open My Journey</Link></div>
      {(catalogue.loading || workspace.loading) && <Loading />}
      {catalogue.error != null && <ConnectionError error={catalogue.error} retry={catalogue.retry} />}
      {workspace.error != null && <ConnectionError error={workspace.error} retry={workspace.retry} />}
      {catalogue.data && state && (visibleSaved.length
        ? visibleSaved.map(service => <SchemeRow key={service.slug} service={service} assessment={eligibility.data?.find(item => item.slug === service.slug)} />)
        : <EmptyState title="No saved schemes yet" action={<Link className="button button-outline" to="/dashboard/services">Browse services</Link>}>Save a service to track its preparation and next steps here.</EmptyState>)}
    </section>
    <div className="citizen-two">
      <section className="card panel section-stack"><div className="section-heading"><h2>Recommended to explore</h2><StatusBadge>Discovery</StatusBadge></div><p>Suggestions use the state you shared and any published rules that can be evaluated.</p>
        <ul className="citizen-link-list">{suggestions.slice(0, 3).map(service => <SuggestedService key={service.slug} service={service} assessment={assessments.get(service.slug)} />)}</ul>
        {catalogue.data && !suggestions.length && <p>No additional catalogue entries match your current state.</p>}
      </section>
      <section className="card panel section-stack"><h2>Quick actions</h2><div className="citizen-link-list">
        <Link to="/dashboard/eligibility" className="text-link">Check scheme eligibility</Link><Link to="/dashboard/documents" className="text-link">Review document readiness</Link><Link to="/dashboard/planner" className="text-link">Plan a service journey</Link><Link to="/dashboard/grievances" className="text-link">Review grievance drafts</Link>
      </div></section>
      <section className="card panel section-stack"><h2>Recently viewed services</h2>{orderedRecent.length
        ? <ul className="citizen-link-list">{orderedRecent.map(service => <li key={service.slug}><Link className="text-link" to={'/dashboard/services/' + service.slug}>{service.name}</Link></li>)}</ul>
        : <p>Services you open in the dashboard will appear here.</p>}</section>
      <section className="card panel section-stack"><h2>Upcoming application deadlines</h2><Notice>No confirmed application dates are available in the catalogue.</Notice><Link className="text-link" to="/dashboard/planner#upcoming">Open upcoming scheme planner</Link></section>
      <section className="card panel section-stack"><h2>Grievance status</h2>{grievances.error != null && <ConnectionError error={grievances.error} retry={grievances.retry} />}<p>{grievances.data ? grievances.data.length + ' locally tracked draft records' : 'Reading grievance records…'}</p><Link className="text-link" to="/dashboard/grievances">Open tracker</Link></section>
      <section className="card panel section-stack"><div className="section-heading"><h2>Recent activity</h2><History size={18} /></div>{journeys.error != null && <ConnectionError error={journeys.error} retry={journeys.retry} />}{activity.length
        ? <ul className="citizen-link-list">{activity.map(item => <li key={item.key}>{item.title} <time className="metadata" dateTime={item.date}>{new Date(item.date).toLocaleDateString()}</time></li>)}</ul>
        : <p>Your recent journey and grievance updates will appear here.</p>}</section>
    </div>
  </div>
}
