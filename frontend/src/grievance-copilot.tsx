import { useState, type FormEvent } from 'react'
import type { Service } from './api'

const templates = {
  en: ['Issue', 'Department', 'What happened', 'Requested resolution', 'Please review this issue and let me know the next steps.'],
  hi: ['शिकायत', 'विभाग', 'क्या हुआ', 'अनुरोधित समाधान', 'कृपया इस समस्या की जाँच करें और आगे के कदम बताएँ।'],
  kn: ['ದೂರು', 'ಇಲಾಖೆ', 'ಏನಾಯಿತು', 'ಕೋರಿದ ಪರಿಹಾರ', 'ದಯವಿಟ್ಟು ಈ ಸಮಸ್ಯೆಯನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಮುಂದಿನ ಕ್ರಮವನ್ನು ತಿಳಿಸಿ.'],
} as const

export function GrievanceCopilot({ services }: { services: Service[] }) {
  const [language, setLanguage] = useState<keyof typeof templates>('en')
  const [draft, setDraft] = useState('')
  const [draftLanguage, setDraftLanguage] = useState<keyof typeof templates>('en')
  const [reviewed, setReviewed] = useState(false)
  const [note, setNote] = useState('')
  const [service, setService] = useState('')
  const department = services.find(item => item.slug === service)?.department
  async function copy() {
    if (!reviewed || !draft.trim()) return
    try {
      await navigator.clipboard.writeText(draft)
      setNote('Draft copied.')
    } catch { setNote('Clipboard unavailable. Select and copy the reviewed text manually.') }
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const [title, recipient, description, resolution, fallback] = templates[language]
    const issue = String(values.get('issue')).trim()
    const text = String(values.get('problem')).trim()
    if (!issue || !text) { setNote('Enter an issue and a description.'); return }
    setDraft([`${title}: ${issue}`, department ? `${recipient}: ${department}` : '',
      `${description}:\n${text}`, `${resolution}:\n${String(values.get('resolution')).trim() || fallback}`]
      .filter(Boolean).join('\n\n'))
    setReviewed(false)
    setNote('')
    setDraftLanguage(language)
  }
  function download() {
    if (!reviewed || !draft.trim()) return
    const url = URL.createObjectURL(new Blob([draft], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'sevapath-grievance-draft.txt'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <details className="card panel section-stack">
    <summary>Smart Grievance Copilot</summary>
    <p>Prepare a draft in this tab. Choose the closest catalogue service for a department suggestion. Review the responsible authority before sending it through the official channel.</p>
    <form className="section-stack" onSubmit={prepare}>
      <div className="citizen-two">
        <label>Complaint draft language<select value={language} onChange={event => setLanguage(event.target.value as keyof typeof templates)}>
          <option value="en">English</option><option value="hi">हिन्दी</option><option value="kn">ಕನ್ನಡ</option>
        </select></label>
        <label>Catalogue service<select value={service} onChange={event => setService(event.target.value)}>
          <option value="">Department unknown</option>
          {services.filter(item => item.department && item.verification_status === 'verified').map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}
        </select></label>
      </div>
      {department && <p>Catalogue department · {department}</p>}
      <label>Issue summary<input name="issue" required dir="auto" maxLength={120} /></label>
      <label>What happened<textarea name="problem" required dir="auto" rows={3} maxLength={2000} /></label>
      <label>What would resolve the issue?<textarea name="resolution" dir="auto" rows={2} maxLength={600} /></label>
      <button type="submit" className="button button-outline">Prepare draft in this tab</button>
    </form>
    {draft && <div className="section-stack">
      <h3>Supporting evidence to consider</h3>
      <ul><li>A dated timeline or acknowledgement reference, if available.</li><li>Relevant correspondence and a copy of the decision or status you are disputing.</li><li>Redact unrelated personal identifiers in anything you share.</li></ul>
      <label>Editable complaint draft<textarea value={draft} lang={draftLanguage} dir="auto" rows={9} onChange={event => {
        setDraft(event.target.value)
        setReviewed(false)
        setNote('')
      }} /></label>
      <label className="inline-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> I reviewed this draft and checked which department should receive it.</label>
      <div className="button-row">
        <button type="button" className="button button-outline" disabled={!reviewed || !draft.trim()} onClick={() => void copy()}>Copy reviewed draft</button>
        <button type="button" className="button button-outline" disabled={!reviewed || !draft.trim()} onClick={download}>Download reviewed draft</button>
      </div>
    </div>}
    {note && <p role="status">{note}</p>}
  </details>
}
