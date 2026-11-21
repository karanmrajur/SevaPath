import { BadgeCheck, Check, ClipboardList, ExternalLink, MapPin, Search, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { api } from './api'
import { IndiaGateIllustration } from './civic-illustration'
import { CategoryIcon, ConnectionError, EmptyState, Loading } from './components'
import { guidedKeyword, guidedTopics } from './data'
import { DocumentReadiness } from './document-readiness'
import { GuidedAssistant } from './guided-assistant'
import { usePortalPreferences } from './portal-preferences'
import { useApi } from './use-api'

const featuredEntries = [
  { slug: 'scholarships', name: ['Scholarships', 'छात्रवृत्तियाँ'], description: ['Find scholarship options.', 'छात्रवृत्ति के विकल्प देखें।'], accent: 'education' },
  { slug: 'income-certificate', name: ['Income Certificate', 'आय प्रमाणपत्र'], description: ['Income certificate details.', 'आय प्रमाणपत्र की जानकारी।'], accent: 'income' },
  { slug: 'eshram', name: ['e-Shram', 'ई-श्रम'], description: ['For unorganised workers.', 'असंगठित श्रमिकों के लिए।'], accent: 'employment' },
  { slug: 'caste-certificate', name: ['Caste Certificate', 'जाति प्रमाणपत्र'], description: ['Caste certificate details.', 'जाति प्रमाणपत्र की जानकारी।'], accent: 'caste' },
] as const

function HomepageJourney({ services }: { services: Awaited<ReturnType<typeof api.allServices>> }) {
  const saved = useApi(api.journeyPreview)
  const { label } = usePortalPreferences()
  const journey = saved.data?.[0]
  const service = services.find(item => item.slug === journey?.service_slug)
  const slug = journey?.service_slug
  const query = slug ? '?' + new URLSearchParams({ service: slug }) : ''
  const complete = (order: number) => journey?.tasks.some(task => task.sort_order === order && task.status === 'complete')
  const ready = journey?.tasks.filter(task => task.status === 'complete').length ?? 0
  const steps = [
    { label: label('Find the right service', 'सही सेवा खोजें'), to: '/services', icon: Search, complete: complete(1) },
    { label: label('Check eligibility', 'पात्रता देखें'), to: '/eligibility' + query, icon: BadgeCheck },
    { label: label('Prepare documents', 'दस्तावेज़ तैयार करें'), to: '/documents' + query, icon: ClipboardList, complete: complete(3) },
    { label: label('Apply on official portal', 'आधिकारिक पोर्टल पर आवेदन करें'), to: slug ? '/services/' + encodeURIComponent(slug) : '/services', icon: ExternalLink, official: service?.official_url },
  ]

  return (
    <div className="home-workspace">
      <section className="card panel section-stack journey-card" aria-labelledby="journey-title">
        <div className="section-heading"><h2 id="journey-title">{label('My Journey', 'मेरी यात्रा')}</h2><MapPin size={20} className="readiness-icon" aria-hidden="true" /></div>
        <ol className="workflow">{steps.map(({ label: title, icon: Icon, to, complete: done, official }) => {
          const content = <><span className={done ? 'workflow-icon completed' : 'workflow-icon'}>{done ? <Check size={18} aria-hidden="true" /> : <Icon size={18} aria-hidden="true" />}</span><span>{title}{done && <span className="sr-only">{label(' (saved as complete)', ' (पूरा चिह्नित)')}</span>}</span></>
          return <li key={title}>{official
            ? <a href={official} target="_blank" rel="noopener noreferrer">{content}<span className="sr-only">{label(' (opens in a new tab)', ' (नए टैब में खुलता है)')}</span></a>
            : <Link to={to}>{content}</Link>}</li>
        })}</ol>
        {saved.loading && <p role="status" className="metadata">{label('Loading saved preparation tasks…', 'सहेजे गए कदम लोड हो रहे हैं…')}</p>}
        {saved.error != null && <ConnectionError error={saved.error} retry={saved.retry} />}
        {saved.data && <p className="workspace-summary">
          {service && <><span lang="en">{service.name}</span> · </>}{journey ? label(ready + ' of ' + journey.tasks.length + ' saved preparation tasks complete', journey.tasks.length + ' में से ' + ready + ' सहेजे गए कदम पूरे') : label('Choose a service to start a preparation journey.', 'तैयारी शुरू करने के लिए सेवा चुनें।')}
        </p>}
        <Link className="text-link" to={'/journeys' + query}>{label('Track My Journey', 'मेरी यात्रा देखें')}</Link>
      </section>
      <DocumentReadiness slug={slug} compact />
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { label } = usePortalPreferences()
  const catalogue = useApi(api.allServices)
  const services = catalogue.data ?? []
  const featured = featuredEntries.flatMap(entry => {
    const service = services.find(item => item.slug === entry.slug)
    return service ? [{ ...entry, service }] : []
  })
  const topics = guidedTopics.filter(topic => services.some(service => service.slug === topic.slug))
  const categories = Array.from(new Set(services.map(service => service.category))).sort()
  const hindiCategories = new Map([['Certificates', 'प्रमाणपत्र'], ['Education', 'शिक्षा'], ['Employment', 'रोज़गार'], ['Welfare', 'समाज कल्याण']])
  const search = label('Search services', 'सेवाएँ खोजें')

  return (
    <div className="home-layout">
      <div className="home-primary">
        <section className="hero card" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">{label('Government Services at Your Fingertips', 'सरकारी सेवाएँ, अब आपकी उँगलियों पर')}</h1>
            <p>{label(
              'Discover schemes, check eligibility, prepare documents and get guided to official government portals — all in one place.',
              'योजनाएँ खोजें, पात्रता देखें, दस्तावेज़ तैयार करें और आधिकारिक सरकारी पोर्टल तक पहुँचें — सब एक ही जगह।',
            )}</p>
          </div>
          <IndiaGateIllustration />
          <form className="portal-search hero-search" role="search" aria-label={label('Service catalogue', 'सेवा कैटलॉग')} onSubmit={event => {
            event.preventDefault()
            const keyword = guidedKeyword(String(new FormData(event.currentTarget).get('q') ?? ''))
            navigate(keyword ? '/services?' + new URLSearchParams({ q: keyword }) : '/services')
          }}>
            <Search size={19} aria-hidden="true" />
            <label htmlFor="hero-keyword" className="sr-only">{search}</label>
            <input type="search" id="hero-keyword" name="q" maxLength={120} placeholder={label('Search for a service or scheme', 'सेवा या योजना खोजें')} />
            <button className="button button-primary" type="submit">{search}</button>
          </form>
          {topics.length > 0 && <div className="search-suggestions"><span>{label('Try', 'आज़माएँ')}</span>{topics.map(topic => (
            <Link key={topic.slug} className="chip" to={'/services?' + new URLSearchParams({ q: topic.keyword })}>{label(topic.label, topic.hindiLabel)}</Link>
          ))}</div>}
        </section>

        <a className="mobile-assistant-link" href="#jan-setu-home"><Sparkles size={18} aria-hidden="true" />{label('Ask JanSetu AI', 'जनसेतु AI से पूछें')}</a>

        <section className="section-stack featured-section" aria-labelledby="popular-title">
          <div className="section-heading"><h2 id="popular-title">{label('Popular Services', 'लोकप्रिय सेवाएँ')}</h2><Link className="text-link" to="/services">{label('View all services', 'सभी सेवाएँ देखें')}</Link></div>
          {catalogue.loading && <Loading />}
          {catalogue.error != null && <ConnectionError error={catalogue.error} retry={catalogue.retry} />}
          {catalogue.data && (featured.length > 0
            ? <div className="featured-grid">{featured.map(({ service, name, description, accent }) => (
              <Link className={'card featured-service feature-' + accent} key={service.slug} to={'/services/' + encodeURIComponent(service.slug)}>
                <CategoryIcon category={service.category} size={19} /><div><h3>{label(name[0], name[1])}</h3><p>{label(description[0], description[1])}</p></div>
              </Link>
            ))}</div>
            : <EmptyState title={label('No featured services available', 'चुनी हुई सेवाएँ उपलब्ध नहीं हैं')}>{label('Open the catalogue to see available services.', 'उपलब्ध सेवाओं के लिए कैटलॉग खोलें।')}</EmptyState>)}
        </section>

        <HomepageJourney services={services} />
        {categories.length > 0 && <section className="section-stack" aria-labelledby="categories-title">
          <h2 id="categories-title">{label('Browse by category', 'श्रेणी के अनुसार देखें')}</h2>
          <div className="search-suggestions">{categories.map(category => <Link className="chip" key={category} to={'/services?' + new URLSearchParams({ category })}>
            {label(category === 'Welfare' ? 'Social welfare' : category, hindiCategories.get(category) ?? category)}
          </Link>)}</div>
        </section>}
      </div>
      <GuidedAssistant embedded />
    </div>
  )
}
