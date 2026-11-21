import { FileCheck2 } from 'lucide-react'
import { Link } from 'react-router'
import { api, type ServiceDocuments } from './api'
import { ConnectionError, Loading } from './components'
import { documentItems } from './data'
import { usePortalPreferences } from './portal-preferences'
import { useWorkspace, type DocumentStatus } from './preferences'
import { useApi } from './use-api'

interface ReadinessItem {
  id: string
  title: string
  requirement?: ServiceDocuments['items'][number]['required_status']
}

const sampleTitles = ['पहचान का रिकॉर्ड', 'पते का रिकॉर्ड', 'सहायक संदर्भ']

function Checklist({ items, slug }: { items: ReadinessItem[]; slug?: string }) {
  const { language, label } = usePortalPreferences()
  const { documentStatus, setDocumentStatus } = useWorkspace()
  const requiredItems = items.filter(item => item.requirement === 'required')
  const tracked = requiredItems.length ? requiredItems : items
  const ready = tracked.filter(item => documentStatus(item.id, slug) === 'ready').length
  const percent = tracked.length ? Math.round(100 * ready / tracked.length) : 0
  const number = new Intl.NumberFormat(language)
  const statusLabels: Record<DocumentStatus, string> = {
    'not-checked': label('Not Checked', 'जाँचा नहीं'),
    missing: label('Missing', 'उपलब्ध नहीं'),
    ready: label('Marked Ready', 'तैयार चिह्नित'),
  }
  const qualifier = {
    required: label('Required', 'आवश्यक'),
    optional: label('Optional', 'वैकल्पिक'),
    conditional: label('Conditional', 'शर्त के अनुसार'),
  }

  return (
    <>
      <div className="readiness-overview">
        <div className="readiness-ring" style={{ background: 'conic-gradient(var(--color-civic-green) ' + percent + '%, #e3ebf4 0)' }} role="progressbar" aria-label={label('Document readiness', 'दस्तावेज़ों की तैयारी')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span>{number.format(percent)}%</span>
        </div>
        <div>
          <strong>{label(
            ready + ' of ' + tracked.length + (requiredItems.length ? ' required items marked ready' : ' items marked ready'),
            number.format(tracked.length) + ' में से ' + number.format(ready) + ' दस्तावेज़ तैयार चिह्नित',
          )}</strong>
          <p>{slug ? label('Your own readiness checklist', 'आपकी तैयारी की सूची') : label('Sample checklist', 'उदाहरण सूची')}</p>
        </div>
      </div>
      <ul className="readiness-list">{items.map((item, index) => {
        const title = language === 'hi' && !slug ? sampleTitles[index] : item.title
        const status = documentStatus(item.id, slug)
        return <li key={item.id}>
          <label className="readiness-row">
            <span><span lang={slug ? 'en' : undefined}>{title}</span>{item.requirement && <small>{qualifier[item.requirement]}</small>}</span>
            <select value={status} data-status={status} aria-label={title + ' · ' + label('readiness', 'तैयारी')} onChange={event => setDocumentStatus(item.id, event.target.value as DocumentStatus, slug)}>
              <option value="not-checked">{statusLabels['not-checked']}</option>
              <option value="missing">{statusLabels.missing}</option>
              <option value="ready">{statusLabels.ready}</option>
            </select>
          </label>
        </li>
      })}</ul>
    </>
  )
}

function ServiceChecklist({ slug }: { slug: string }) {
  const { label } = usePortalPreferences()
  const { data, error, loading, retry } = useApi(api.serviceDocuments, slug)
  if (loading) return <Loading />
  if (error != null) return <ConnectionError error={error} retry={retry} />
  if (data?.verification_status === 'verified' && data.items.length > 0) {
    return <Checklist slug={slug} items={data.items.map(item => ({ id: String(item.id), title: item.document_name, requirement: item.required_status }))} />
  }
  return <>
    <p className="metadata">{label('Official document requirements are unavailable for this service. Use the sample checklist for general preparation.', 'इस सेवा के आधिकारिक दस्तावेज़ों की जानकारी उपलब्ध नहीं है। सामान्य तैयारी के लिए उदाहरण सूची का उपयोग करें।')}</p>
    <Checklist items={documentItems} />
  </>
}

export function DocumentReadiness({ slug, compact = false }: { slug?: string; compact?: boolean }) {
  const { language, label } = usePortalPreferences()
  return (
    <section className="card panel section-stack readiness-card" lang={language}>
      <div className="section-heading"><h2>{label('Document Readiness', 'दस्तावेज़ों की तैयारी')}</h2><FileCheck2 className="readiness-icon" size={20} aria-hidden="true" /></div>
      {slug ? <ServiceChecklist slug={slug} /> : <Checklist items={documentItems} />}
      {compact && <Link className="text-link" to={'/documents' + (slug ? '?' + new URLSearchParams({ service: slug }) : '')}>{label('Open document checklist', 'दस्तावेज़ों की सूची खोलें')}</Link>}
    </section>
  )
}
