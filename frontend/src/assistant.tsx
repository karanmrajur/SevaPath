import { BookOpen, Sparkles } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from './components'
import { GuidedAssistant } from './guided-assistant'
import { usePortalPreferences } from './portal-preferences'

export function Assistant() {
  const [params] = useSearchParams()
  const { label } = usePortalPreferences()
  const question = (params.get('question') ?? '').slice(0, 500)

  return (
    <div className="page-stack">
      <PageHeader title="JanSetu AI" description={label('Find relevant catalogue entries and official sources with guided assistance.', 'मार्गदर्शन से कैटलॉग में सेवाएँ और आधिकारिक स्रोत खोजें।')} icon={<Sparkles size={22} />} />
      <div className="work-grid">
        <GuidedAssistant key={question} initialQuestion={question} />
        <aside className="card panel info-panel">
          <span className="tile-icon accent-green"><BookOpen size={21} aria-hidden="true" /></span>
          <h2>{label('How guided assistance works', 'मार्गदर्शन कैसे काम करता है')}</h2>
          <p>{label('JanSetu searches the service catalogue. Open a result to see its official sources and continue to the government portal.', 'जनसेतु सेवा कैटलॉग में खोज करता है। आधिकारिक स्रोत देखने और सरकारी पोर्टल पर जाने के लिए कोई नतीजा खोलें।')}</p>
          <Link className="button button-outline" to="/dashboard/assistant">
            {label('Open private chat and voice', 'निजी चैट और आवाज़ खोलें')}
          </Link>
          <p className="metadata">{label('For tailored requirements and decisions, consult the relevant government portal.', 'अपनी स्थिति के अनुसार आवश्यकताओं और निर्णयों के लिए संबंधित सरकारी पोर्टल देखें।')}</p>
        </aside>
      </div>
    </div>
  )
}
