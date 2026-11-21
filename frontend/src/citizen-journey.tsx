import { Route } from 'lucide-react'
import { Link } from 'react-router'
import { api, type Journey, type Service } from './api'
import { citizenApi, preparationTasks, type Application, type EligibilityAssessment } from './citizen-api'
import { useCitizen } from './citizen-context'
import { profileProgress } from './citizen-profile'
import { WalletLockedNotice } from './citizen-wallet'
import { ConnectionError, EmptyState, Loading, Notice, PageHeader, PortalLink, Progress, StatusBadge } from './components'
import { useApi } from './use-api'

export function assessmentLabel(result?: EligibilityAssessment) {
  if (!result) return 'Insufficient information'
  return {
    eligible: 'Eligible on configured rules',
    potentially_eligible: 'Potentially eligible',
    not_eligible: 'Does not meet a configured condition',
    insufficient_information: 'Insufficient information',
  }[result.assessment_state]
}

export function CitizenJourney() {
  const { citizen, catalogue, workspace } = useCitizen()
  const journeys = useApi(citizenApi.journeys)
  const assessments = useApi(citizenApi.eligibility, JSON.stringify(citizen.profile))
  const saved = workspace.data?.saved ?? []
  const applications = workspace.data?.applications ?? {}
  const tracked = new Set([...saved, ...Object.keys(applications), ...(journeys.data ?? []).map(item => item.service_slug)])
  const services = catalogue.data?.filter(service => tracked.has(service.slug)) ?? []
  const completion = profileProgress(citizen).percentage

  return <div className="page-stack">
    <PageHeader title="My Journey" description="Track your preparation and record updates from official portals." icon={<Route size={23} />} />
    <section className="card panel section-stack"><h2>Basic profile completion</h2><p>{completion}% of basic details filled</p><Progress value={completion} label="Basic profile completion" /><Link className="text-link" to="/dashboard/required-details">Review profile details</Link></section>
    <Notice>Preparation progress comes from your checklist. Any submission, reference or decision shown here was entered by you.</Notice>
    {(catalogue.loading || workspace.loading || journeys.loading || assessments.loading) && <Loading />}
    {[catalogue, workspace, journeys, assessments].map((result, index) => result.error != null && <ConnectionError key={index} error={result.error} retry={result.retry} />)}
    {catalogue.data && workspace.data && journeys.data && (services.length ? <div className="citizen-two">
      {services.map(service => <JourneyCard key={service.slug} service={service} application={applications[service.slug]}
        savedAt={workspace.data?.saved_at[service.slug]} journey={journeys.data?.find(item => item.service_slug === service.slug)}
        assessment={assessments.data?.find(item => item.slug === service.slug)} />)}
    </div> : <EmptyState title="No saved journeys" action={<Link className="button button-primary" to="/dashboard/services">Explore the services directory</Link>}>Save a service or start a preparation journey to see it here.</EmptyState>)}
  </div>
}

const stages = ['Scheme Discovered', 'Eligibility Reviewed', 'Documents Prepared', 'Ready to Apply', 'Applied on Official Portal', 'Awaiting Official Decision', 'Approved / Rejected / Closed']

function JourneyCard({ service, application, assessment, journey, savedAt }: {
  service: Service
  application?: Application
  assessment?: EligibilityAssessment
  journey?: Journey
  savedAt?: string
}) {
  const { walletOpen, inventoryVersion } = useCitizen()
  const detail = useApi(api.service, service.slug)
  const documents = useApi(api.serviceDocuments, service.slug)
  const readiness = useApi(citizenApi.readiness, service.slug, walletOpen, inventoryVersion)
  const tasks = application?.tasks ?? [false, false, false]
  const preparation = Math.round(100 * tasks.filter(Boolean).length / preparationTasks.length)
  const stage = tasks.every(Boolean) ? stages[3] : tasks[0] && tasks[1] ? stages[2] : tasks[0] ? stages[1] : stages[0]
  const status = application?.status
  const completed = status === 'Approved' || status === 'Rejected' || status === 'Closed'
  const submitted = !!application?.submission_date || status === 'Submitted' || status === 'In progress' || completed
  const missing = readiness.data?.items.filter(row => row.requirement.required_status === 'required' && (row.status === 'missing' || row.status === 'expired'))
  const updated = [application?.updated_at, journey?.updated_at, savedAt].filter((value): value is string => !!value)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0]
  const query = '?' + new URLSearchParams({ service: service.slug })
  const nextStep = application?.next_step || (completed ? 'Review the decision on the official portal.' : submitted ? 'Check for updates on the official portal.'
    : !tasks[0] ? 'Review the published eligibility criteria.' : !tasks[1] ? 'Prepare the required documents.' : 'Review the official application process.')
  return <article className="card panel section-stack">
    <div className="section-heading"><h2>{service.name}</h2><StatusBadge tone="blue">{stage}</StatusBadge></div>
    <div className="journey-metrics">
      <div className="journey-donut" style={{ background: 'conic-gradient(var(--citizen-green, #18765d) ' + preparation + '%, var(--line, #dce5ee) 0)' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={preparation} aria-label="Preparation tasks complete">
        <span>{preparation}%</span></div>
      <div><strong>Preparation tasks</strong><p>{tasks.filter(Boolean).length} of {preparationTasks.length} complete</p><p>{assessmentLabel(assessment)}{assessment?.match_percentage != null && ' · ' + assessment.match_percentage + '% rule match'}</p></div>
    </div>
    <ol className="journey-timeline">{stages.map((label, index) => {
      const done = [true, tasks[0], tasks[0] && tasks[1], tasks.every(Boolean), submitted, status === 'In progress', completed][index]
      return <li key={label} data-done={done}>{label} {done && <StatusBadge tone={index < 4 ? 'green' : 'blue'}>{index < 4 ? 'Complete' : 'User reported'}</StatusBadge>}</li>
    })}</ol>
    <h3>Document readiness</h3>
    {!walletOpen && <WalletLockedNotice />}
    {readiness.loading && <Loading />}
    {readiness.error != null && <ConnectionError error={readiness.error} retry={readiness.retry} />}
    {readiness.data?.percentage != null && <><p>{readiness.data.percentage}% of known required documents uploaded</p><Progress value={readiness.data.percentage} label="Document readiness" /></>}
    {documents.loading && <Loading />}
    {documents.error != null && <ConnectionError error={documents.error} retry={documents.retry} />}
    {documents.data && <p><strong>Required documents</strong> · {documents.data.items.filter(item => item.required_status === 'required').map(item => item.document_name).join(', ') || 'No verified unconditional items listed'}</p>}
    {missing && <p><strong>Missing or expired</strong> · {missing.map(item => item.requirement.document_name).join(', ') || 'None matched as missing or expired'}</p>}
    {readiness.data?.items.some(row => row.status === 'unmapped' && row.requirement.required_status === 'required') && <p>Some required items still need manual review.</p>}
    <dl className="details-list">
      <div><dt>Application status</dt><dd>{status && status !== 'Preparing' ? status + ' · User reported' : 'No submission update recorded'}</dd></div>
      <div><dt>Submission reference</dt><dd>{[application?.reference, application?.submission_date].filter(Boolean).join(' · ') || 'Unavailable'}</dd></div>
      <div><dt>Official deadline</dt><dd>{detail.data?.catalogue?.application_deadline ?? 'Not verified'}</dd></div>
      <div><dt>Last updated</dt><dd>{updated ? new Date(updated).toLocaleDateString() : 'Not recorded'}</dd></div>
      <div><dt>Next step</dt><dd>{nextStep}</dd></div>
    </dl>
    <div className="button-row"><Link className="button button-primary" to={'/dashboard/applications' + query}>Update tracking</Link>
      <Link className="text-link" to={'/dashboard/eligibility' + query}>Review eligibility</Link>
      {detail.data?.catalogue?.official_application_url
        ? <a className="text-link" href={detail.data.catalogue.official_application_url} target="_blank" rel="noreferrer">Official application portal</a>
        : <PortalLink service={service} />}
    </div>
  </article>
}
