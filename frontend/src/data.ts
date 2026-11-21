export const guidedTopics = [
  { slug: 'scholarships', label: 'Scholarships', hindiLabel: 'छात्रवृत्तियाँ', keyword: 'scholarship', matches: ['scholar', 'छात्रवृत्ति'] },
  { slug: 'income-certificate', label: 'Income Certificate', hindiLabel: 'आय प्रमाणपत्र', keyword: 'income certificate', matches: ['income certificate', 'aay praman', 'आय प्रमाण'] },
  { slug: 'eshram', label: 'e-Shram', hindiLabel: 'ई-श्रम', keyword: 'eshram', matches: ['eshram', 'e-shram', 'e shram', 'ई-श्रम', 'ई श्रम'] },
]

export function guidedKeyword(question: string) {
  const normalized = question.trim().toLowerCase()
  const topic = guidedTopics.find(item => item.matches.some(match => normalized.includes(match)))
  if (topic) return topic.keyword
  if (normalized.includes('जाति प्रमाण') || normalized.includes('caste certificate')) return 'caste certificate'
  if (normalized.includes('गृह लक्ष्मी') || normalized.includes('गृहलक्ष्मी')) return 'gruha lakshmi'
  return normalized.replace(/[?!.,]+$/u, '').slice(0, 120)
}

export interface DocumentItem {
  id: string
  title: string
  note: string
}

export const documentItems: DocumentItem[] = [
  { id: 'identity', title: 'Identity record', note: 'Example record for your preparation checklist' },
  { id: 'address', title: 'Address record', note: 'Example record for your preparation checklist' },
  { id: 'reference', title: 'Supporting reference', note: 'Example record for your preparation checklist' },
]

export interface LegacyComplaintDraft {
  subject: string
  department: string
  description: string
}
