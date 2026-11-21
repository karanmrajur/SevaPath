import { useId, useState } from 'react'
import { BadgeCheck, BookOpen, ClipboardList, ExternalLink, Send, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { ConnectionError, Loading } from './components'
import { guidedKeyword } from './data'
import { usePortalPreferences } from './portal-preferences'
import { useServices } from './use-api'

const suggestedQuestions = [
  ['How do I get an income certificate?', 'आय प्रमाणपत्र कैसे बनवाएँ?'],
  ['Where can I find scholarships?', 'छात्रवृत्ति कहाँ खोजूँ?'],
  ['What is e-Shram?', 'ई-श्रम क्या है?'],
]

function GuidanceSteps({ slug, portal }: { slug?: string; portal?: string | null }) {
  const { label } = usePortalPreferences()
  const detail = slug ? '/services/' + encodeURIComponent(slug) : '/services'
  const query = slug ? '?' + new URLSearchParams({ service: slug }) : ''
  const steps = [
    { icon: BookOpen, title: label('Review the service information', 'सेवा की जानकारी देखें'), to: detail },
    { icon: BadgeCheck, title: label('Try the eligibility preview', 'पात्रता का पूर्वावलोकन करें'), to: '/eligibility' + query },
    { icon: ClipboardList, title: label('Prepare your document checklist', 'दस्तावेज़ों की सूची तैयार करें'), to: '/documents' + query },
  ]

  return (
    <ol className="guidance-steps" aria-label={label('Preparation steps', 'तैयारी के कदम')}>
      {steps.map(({ icon: Icon, title, to }) => <li key={to}><Link to={to}><Icon size={16} aria-hidden="true" />{title}</Link></li>)}
      {portal && <li><a href={portal} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />{label('Visit the official portal', 'आधिकारिक पोर्टल पर जाएँ')}<span className="sr-only">{label(' (opens in a new tab)', ' (नए टैब में खुलता है)')}</span></a></li>}
    </ol>
  )
}

function CatalogueGuidance({ keyword }: { keyword: string }) {
  const { label } = usePortalPreferences()
  const { data, loading, error, retry } = useServices(new URLSearchParams({ q: keyword, page_size: '6' }).toString())
  if (loading) return <Loading />
  if (error != null) return <ConnectionError error={error} retry={retry} />
  const services = data?.items ?? []
  const best = services[0]
  if (!best) return <div className="assistant-message" role="status">{label('No matching services. Try a shorter service name or a different topic.', 'कोई मिलती-जुलती सेवा नहीं मिली। सेवा का छोटा नाम या कोई दूसरा विषय आज़माएँ।')}</div>

  return (
    <div className="assistant-results">
      <div className="assistant-message" role="status"><strong>{label('Matching catalogue entries', 'कैटलॉग में मिली सेवाएँ')}</strong>
        <ul>{services.map(service => <li key={service.id}><Link className="text-link" to={'/services/' + encodeURIComponent(service.slug)} lang="en">{service.name}</Link></li>)}</ul>
        {data && data.total > services.length && <Link className="text-link" to={'/services?' + new URLSearchParams({ q: keyword })}>{label('See all matches', 'सभी नतीजे देखें')}</Link>}
      </div>
      {services.length === 1 && <GuidanceSteps slug={best.slug} portal={best.official_url} />}
    </div>
  )
}

export function GuidedAssistant({ initialQuestion = '', embedded = false }: { initialQuestion?: string; embedded?: boolean }) {
  const { label } = usePortalPreferences()
  const inputId = useId()
  const headingId = useId()
  const [input, setInput] = useState('')
  const [question, setQuestion] = useState(initialQuestion)
  const keyword = guidedKeyword(question)

  return (
    <section className={embedded ? 'assistant-panel assistant-rail card' : 'assistant-panel card'} id={embedded ? 'jan-setu-home' : undefined} tabIndex={embedded ? -1 : undefined} aria-labelledby={headingId}>
      <header className="assistant-panel-header">
        <span className="assistant-avatar"><Sparkles size={20} aria-hidden="true" /></span>
        <div><h2 id={headingId}>JanSetu AI</h2><p>{label('Catalogue-guided assistance', 'कैटलॉग आधारित सहायता')}</p></div>
      </header>
      <div className="assistant-body">
        <div className="assistant-message">{label('Ask about a public service. I can point you to catalogue entries and official sources.', 'किसी सार्वजनिक सेवा के बारे में पूछें। कैटलॉग और आधिकारिक स्रोतों के लिंक यहाँ मिलेंगे।')}</div>
        {question ? <>
          <div className="assistant-message assistant-user"><strong>{label('You', 'आप')}</strong><p dir="auto">{question}</p></div>
          <CatalogueGuidance keyword={keyword || question.slice(0, 120)} />
        </> : <GuidanceSteps />}
        <div className="assistant-suggestions">
          <h3>{label('Suggested questions', 'सुझाए गए सवाल')}</h3>
          {suggestedQuestions.map(([english, hindi]) => <button type="button" className="chip" key={english} onClick={() => setQuestion(label(english, hindi))}>{label(english, hindi)}</button>)}
        </div>
      </div>
      <form className="assistant-composer" onSubmit={event => {
        event.preventDefault()
        if (!guidedKeyword(input)) return
        setQuestion(input.trim())
        setInput('')
      }}>
        <label className="sr-only" htmlFor={inputId}>{label('Ask about a public service', 'सार्वजनिक सेवा के बारे में पूछें')}</label>
        <input id={inputId} value={input} onChange={event => setInput(event.target.value)} maxLength={500} placeholder={label('Type your question…', 'अपना सवाल लिखें…')} />
        <button className="button button-primary" type="submit" disabled={!guidedKeyword(input)} aria-label={label('Send question', 'सवाल भेजें')}><Send size={17} aria-hidden="true" /><span>{label('Send', 'भेजें')}</span></button>
      </form>
      <div className="assistant-panel-footer">
        <p>{label('Public catalogue guidance.', 'सार्वजनिक कैटलॉग मार्गदर्शन।')}</p>
        {embedded && <Link className="text-link" to="/assistant">{label('Open JanSetu AI', 'जनसेतु AI खोलें')}</Link>}
      </div>
    </section>
  )
}
