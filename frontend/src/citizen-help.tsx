import { useRef, useState, type FormEvent } from 'react'
import { HelpCircle, Mail, Search } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader, Notice } from './components'

const addresses = ['karanmrajur8@gamil.com', 'sdramadhar0001@gmail.com']
const phones = [['Karan', '7619383706'], ['Ramadhar', '6260142473'], ['Abhishek', '9441395701']]
const articles = [
  { title: 'How do I unlock my document wallet?', text: 'Sign in, open My Documents and enter your account password or configured six-digit MPIN. The wallet locks after five minutes.', path: '/dashboard/documents', action: 'Open document wallet' },
  { title: 'What does an eligibility match mean?', text: 'The percentage covers published conditions configured for that service. Missing information stays unknown, and the government department decides eligibility.', path: '/dashboard/eligibility', action: 'Review eligibility' },
  { title: 'Where do I submit an application?', text: 'Use the official link on the service page. Add the reference and submission date to My Applications for your own records.', path: '/dashboard/services', action: 'Browse services' },
  { title: 'How do I update or delete my private information?', text: 'Edit optional fields in Required Details. Download account data in Settings or use Privacy to delete the account and its active records.', path: '/dashboard/settings', action: 'Open settings' },
  { title: 'How do I report a problem with a public service?', text: 'Use the grievance workspace to prepare a complaint for the appropriate authority. Use the form below for SevaPath feedback or support.', path: '/dashboard/grievances', action: 'Open grievance assistant' },
]

export function CitizenHelp() {
  const [query, setQuery] = useState('')
  const [mailto, setMailto] = useState('')
  const [status, setStatus] = useState('')
  const lastCompose = useRef(0)
  const matches = articles.filter(article => query.toLowerCase().trim().split(/\s+/u).every(word => (article.title + ' ' + article.text).toLowerCase().includes(word)))

  function compose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const read = (name: string) => String(fields.get(name) ?? '').trim()
    setStatus('')
    if (read('website')) return
    if (Date.now() - lastCompose.current < 4000) { setStatus('Wait a few seconds before opening another draft.'); return }
    const name = read('name').replace(/[\r\n]+/gu, ' ')
    const email = read('email')
    const subject = read('subject').replace(/[\r\n]+/gu, ' ')
    const message = read('message')
    if (!name || !subject || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      setStatus('Enter your name, email, subject and message.')
      return
    }
    const heading = '[' + read('type') + '] ' + subject
    const body = ['Name: ' + name, 'Reply email: ' + email, '', message].join('\r\n')
    const url = 'mailto:' + addresses[1] + '?subject=' + encodeURIComponent(heading) + '&body=' + encodeURIComponent(body)
    lastCompose.current = Date.now()
    setMailto(url)
    setStatus('Your draft is ready. Open your email application to review and send it.')
  }

  return <div className="page-stack">
    <PageHeader title="Help Centre" description="Find answers or contact the SevaPath team." icon={<HelpCircle size={22} />} />
    <section className="card panel section-stack"><h2>Frequently asked questions</h2>
      <label>Search help articles<span className="search-field"><Search size={18} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={120} /></span></label>
      {matches.length ? matches.map(article => <details key={article.title}><summary>{article.title}</summary><p>{article.text}</p><Link className="text-link" to={article.path}>{article.action}</Link></details>)
        : <p role="status">No help articles match your search.</p>}
    </section>
    <div className="citizen-two">
      <form className="card panel section-stack" onSubmit={compose} onChange={() => { setMailto(''); setStatus('') }}>
        <h2>Contact, complaint or feedback</h2>
        <Notice>Submit prepares a message draft. Use the draft link to open your email application and review it before sending. Avoid including identity numbers or private documents.</Notice>
        <label>Request type<select name="type"><option>Question</option><option>Complaint</option><option>Feedback</option></select></label>
        <label>Name<input name="name" autoComplete="name" maxLength={120} required /></label>
        <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>Subject<input name="subject" maxLength={120} required /></label>
        <label>Message<textarea name="message" rows={5} maxLength={1500} required /></label>
        <div className="citizen-contact-check" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <button className="button button-primary">Submit and prepare draft</button>
        {status && <p role="status">{status}</p>}{mailto && <a className="text-link" href={mailto}>Open email application</a>}
      </form>
      <section className="card panel section-stack"><h2>Support contacts</h2>
        <ul className="citizen-link-list">{addresses.map(email => <li key={email}><a className="text-link" href={'mailto:' + email}>{email}</a></li>)}</ul>
        <ul className="citizen-link-list">{phones.map(([name, phone]) => <li key={name}>{name} <a className="text-link" href={'tel:' + phone}>{phone}</a></li>)}</ul>
        <a className="button button-outline" href={'mailto:' + addresses[1]}><Mail size={16} /> Email support</a>
      </section>
    </div>
  </div>
}
