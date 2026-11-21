import { CircleHelp } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from './components'

export function Help() {
  return (
    <div className="page-stack">
      <PageHeader title="Help" description="Find your way around SevaPath and learn how your workspace data is used." icon={<CircleHelp size={22} />} />
      <section className="card panel section-stack" id="about">
        <h2>About SevaPath</h2>
        <p>SevaPath helps you find Indian public services, organise preparation tasks and reach the relevant government portal. It is an independent citizen-assistance platform.</p>
        <div className="button-row"><Link className="button button-primary" to="/services">Explore Services</Link><Link className="button button-outline" to="/assistant">Open JanSetu AI</Link></div>
      </section>
      <section className="card panel section-stack">
        <h2>Applications and grievances</h2>
        <p>Open a service page to find its official portal and source references. Use the official channel to confirm requirements, apply or submit a grievance.</p>
        <Link className="text-link" to="/grievances">Prepare a grievance draft</Link>
      </section>
      <section className="card panel section-stack" id="privacy">
        <h2>Privacy information</h2>
        <p>Checklist selections are saved in this browser. Journeys and grievance drafts are stored by SevaPath and associated with an anonymous session cookie. Clearing or losing the cookie ends this browser’s access to those records.</p>
        <p>Keep personal identifiers and identity documents out of grievance drafts. JanSetu’s guided assistance searches the service catalogue, so use public service names or topics in the search field.</p>
      </section>
    </div>
  )
}
