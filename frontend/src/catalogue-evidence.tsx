import type { ServiceDetail } from './api'

export function ApplicationFacts({ data }: { data: ServiceDetail['catalogue'] }) {
  return <dl className="details-list">
    <div><dt>Current application status</dt><dd>{data?.application_status ?? 'Not verified'}</dd></div>
    <div><dt>Opens</dt><dd>{data?.application_opens ?? 'Not verified'}</dd></div>
    <div><dt>Deadline</dt><dd>{data?.application_deadline ?? 'Not verified'}</dd></div>
    <div><dt>Previous application period</dt><dd>{data?.previous_application_period ?? 'Not verified'}</dd></div>
    <div><dt>Previous eligibility</dt><dd>{data?.previous_eligibility ?? 'Not verified'}</dd></div>
  </dl>
}

export function CatalogueEvidence({ service }: { service: ServiceDetail }) {
  const details = service.catalogue
  if (!details) return null
  return <section className="card panel section-stack">
    <h2>Benefits</h2>
    {details.benefits.length ? <ul>{details.benefits.map(item => <li key={item}>{item}</li>)}</ul> : <p>Not verified</p>}
    <h2>Eligibility criteria</h2>
    {details.eligibility_guidance.length ? <ul>{details.eligibility_guidance.map(item => <li key={item}>{item}</li>)}</ul> : <p>Not verified</p>}
    <h2>Application procedure</h2>
    {details.procedure.length ? <ol>{details.procedure.map(item => <li key={item}>{item}</li>)}</ol> : <p>Not verified</p>}
    <ApplicationFacts data={details} />
    <div className="button-row">
      {details.official_information_url && <a className="text-link" href={details.official_information_url} target="_blank" rel="noopener noreferrer">Official information</a>}
      {details.official_application_url && <a className="text-link" href={details.official_application_url} target="_blank" rel="noopener noreferrer">Official application portal</a>}
    </div>
  </section>
}
