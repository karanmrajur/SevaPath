import { FileCheck2, UploadCloud } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Milestone, PageHeader } from './components'
import { DocumentReadiness } from './document-readiness'

export function Documents() {
  const [params] = useSearchParams()
  const slug = params.get('service') || undefined
  return (
    <div className="page-stack">
      <PageHeader title="Documents" description="Organise your checklist and track which documents you have ready." icon={<FileCheck2 size={24} />} />
      <div className="work-grid">
        <DocumentReadiness slug={slug} />
        <aside className="card panel info-panel">
          <span className="tile-icon accent-blue"><UploadCloud size={23} /></span>
          <h2>Document uploads</h2>
          <Milestone>File uploads, text extraction and document verification are planned for a later version.</Milestone>
        </aside>
      </div>
    </div>
  )
}
