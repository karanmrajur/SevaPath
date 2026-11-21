import { useState } from 'react'
import { BadgeCheck, ClipboardList, Info } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { ConnectionError, EmptyState, Loading, Milestone, PageHeader, PortalLink, Progress, StatusBadge } from './components'
import { useServices } from './use-api'

interface Answers {
  service: string
  residence: string
  purpose: string
}

const steps = ['Choose a service', 'Select your region', 'Review your goal']
const regions = ['Karnataka', 'Another Indian state or union territory', 'Prefer not to say']
const purposes = ['Explore the service', 'Prepare for an application', 'Help someone else']

export function Eligibility() {
  const [params] = useSearchParams()
  const catalog = useServices('page_size=50')
  const services = catalog.data?.items ?? []
  const initialService = params.get('service') ?? ''
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({ service: initialService, residence: '', purpose: '' })
  const selectedService = services.find(service => service.slug === answers.service)
  const complete = step === steps.length

  function setAnswer(field: keyof Answers, value: string) {
    setAnswers(previous => ({ ...previous, [field]: value }))
  }

  return (
    <div className="page-stack">
      <PageHeader title="Eligibility preview" description="Try a short questionnaire and review your answers." icon={<BadgeCheck size={24} />} />
      <div className="work-grid">
        <section className="card panel section-stack">
          <div className="section-heading"><StatusBadge tone="blue">{complete ? 'Questionnaire complete' : 'Step ' + (step + 1) + ' of ' + steps.length}</StatusBadge><ClipboardList size={20} /></div>
          <Progress label="Questionnaire steps completed" value={step * 100 / steps.length} />
          {catalog.loading ? <Loading /> : catalog.error != null ? <ConnectionError error={catalog.error} retry={catalog.retry} /> : !services.length
            ? <EmptyState title="No services available">The catalog needs a service before you can try the questionnaire.</EmptyState>
            : complete ? (
            <>
              <h2>Your answers</h2>
              <dl className="details-list">
                <div><dt>Service</dt><dd>{selectedService?.name}</dd></div>
                <div><dt>Region</dt><dd>{answers.residence}</dd></div>
                <div><dt>Goal</dt><dd>{answers.purpose}</dd></div>
              </dl>
              <Milestone>Eligibility assessment will be available when official rule references are integrated.</Milestone>
              <div className="button-row">
                {selectedService && <PortalLink service={selectedService} />}
                <button type="button" className="button button-outline" onClick={() => setStep(0)}>Edit answers</button>
              </div>
            </>
          ) : (
            <form className="section-stack" onSubmit={event => { event.preventDefault(); setStep(step + 1) }}>
              <h2>{steps[step]}</h2>
              {step === 0 && <label>Service<select value={selectedService?.slug ?? ''} required onChange={event => setAnswer('service', event.target.value)}>
                <option value="">Select a service</option>{services.map(service => <option key={service.id} value={service.slug}>{service.name}</option>)}
              </select></label>}
              {step === 1 && <label>Where do you live?<select value={answers.residence} required onChange={event => setAnswer('residence', event.target.value)}>
                <option value="">Select a region</option>{regions.map(region => <option key={region}>{region}</option>)}
              </select></label>}
              {step === 2 && <label>What would you like to do?<select value={answers.purpose} required onChange={event => setAnswer('purpose', event.target.value)}>
                <option value="">Select a goal</option>{purposes.map(purpose => <option key={purpose}>{purpose}</option>)}
              </select></label>}
              <div className="button-row">
                {step > 0 && <button type="button" className="button button-outline" onClick={() => setStep(step - 1)}>Back</button>}
                <button type="submit" className="button button-primary">{step === steps.length - 1 ? 'Review answers' : 'Continue'}</button>
              </div>
            </form>
          )}
        </section>
        <aside className="card panel info-panel">
          <span className="tile-icon accent-amber"><Info size={22} /></span>
          <h2>How to use this preview</h2>
          <p>Choose a service, select a region and record your goal. The result card summarises your answers.</p>
          <p>Check the service’s official portal for published eligibility criteria.</p>
        </aside>
      </div>
    </div>
  )
}
