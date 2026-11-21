import type { ScanCatalogueEntry, ScanRule } from './api'

export const supportedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
export function validImageFile(file: Pick<File, 'type' | 'size'>) {
  return supportedImageTypes.includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024
}

export const scanTypes = [
  'Birth Certificate', 'Aadhaar Card', 'RTC / Pahani / Land Records', 'Ration card',
  'Income certificate', 'Caste certificate', 'Residence certificate', 'Address proof',
  'Education marksheet', 'Bank Passbook', 'Farmer document', 'Learner licence', 'Driving Licence',
] as const
export type ScanType = typeof scanTypes[number]
export type Fact = 'age' | 'landholding' | 'gruha_lakshmi_household_head'
export type ConfirmedDocument = {
  type: ScanType
  age?: number
  landholding?: boolean
  gruha_lakshmi_household_head?: boolean
  expiresOn?: string
  confirmationPending?: boolean
  reviewFields?: string[]
}
export type Draft = { age: string; answer: string; expiry: string }
export type Status = 'eligible' | 'potentially_eligible' | 'not_eligible' | 'insufficient_information'
type RuleStatus = 'matched' | 'failed' | 'unknown'
export const emptyDraft: Draft = { age: '', answer: '', expiry: '' }
export const ageTypes: readonly ScanType[] = ['Birth Certificate', 'Aadhaar Card', 'Driving Licence']
export const expiryTypes: readonly ScanType[] = ['Learner licence', 'Driving Licence']
export const booleanFields = {
  'RTC / Pahani / Land Records': 'landholding',
  'Ration card': 'gruha_lakshmi_household_head',
} as const

export function indiaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts()
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function normalizedDate(value = '') {
  const iso = value.replaceAll('/', '-').replaceAll('.', '-')
  const india = /^(\d{1,2})-(\d{1,2})-(\d{4})$/u.exec(iso)
  const result = india ? `${india[3]}-${india[2].padStart(2, '0')}-${india[1].padStart(2, '0')}` : iso
  return validDate(result) ? result : ''
}

export function derivedAge(birth: string, today: string) {
  if (!birth || birth > today) return ''
  const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - Number(today.slice(5) < birth.slice(5))
  return age <= 125 ? String(age) : ''
}

export function extractDraft(type: ScanType, text: string, today = indiaToday()): Draft {
  const draft = { ...emptyDraft }
  const dateToken = '(\\d{4}[-/.]\\d{2}[-/.]\\d{2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4})(?!\\d)'
  if (ageTypes.includes(type)) {
    const literalAge = /\bAge[ \t]*[:=][ \t]*(\d{1,3})\b/iu.exec(text)?.[1]
    const dob = new RegExp('(?:date of birth|d\\.?o\\.?b\\.?)[ \\t]*[:=]?[ \\t]*' + dateToken, 'iu').exec(text)?.[1]
    draft.age = dob ? derivedAge(normalizedDate(dob), today) : literalAge && Number(literalAge) <= 125 ? literalAge : ''
  }
  if (expiryTypes.includes(type)) {
    draft.expiry = normalizedDate(new RegExp('(?:expiry(?: date)?|valid (?:until|till|upto|to))[ \\t]*[:=]?[ \\t]*' + dateToken, 'iu').exec(text)?.[1])
  }
  if (type === 'RTC / Pahani / Land Records') {
    draft.answer = /\b(?:applicant|applicant family) is (?:a )?landholding (?:farmer|family)[ \t]*[:=][ \t]*(yes|no)\b/iu.exec(text)?.[1]?.toLowerCase() ?? ''
  }
  if (type === 'Ration card') {
    draft.answer = /\bapplicant is (?:the )?woman listed as (?:the )?head of (?:the )?household[ \t]*[:=][ \t]*(yes|no)\b/iu.exec(text)?.[1]?.toLowerCase() ?? ''
  }
  return draft
}

export function confirmedDocument(type: ScanType, draft: Draft): ConfirmedDocument {
  const result: ConfirmedDocument = { type }
  if (ageTypes.includes(type) && draft.age.trim()) {
    if (!/^\d{1,3}$/u.test(draft.age.trim()) || Number(draft.age) > 125) throw new Error('Enter an age between 0 and 125, or leave it blank.')
    result.age = Number(draft.age)
  }
  const field = booleanFields[type as keyof typeof booleanFields]
  if (field && (draft.answer === 'yes' || draft.answer === 'no')) result[field] = draft.answer === 'yes'
  if (expiryTypes.includes(type) && draft.expiry) {
    if (!validDate(draft.expiry)) throw new Error('Enter an expiry date from the document, or leave it blank.')
    result.expiresOn = draft.expiry
  }
  return result
}

export type EligibilityFacts = Pick<ConfirmedDocument, Fact>
const supportedFacts: Fact[] = ['age', 'landholding', 'gruha_lakshmi_household_head']

export function checkRule(rule: ScanRule, docs: ConfirmedDocument[], facts?: EligibilityFacts): RuleStatus {
  if (!supportedFacts.includes(rule.field as Fact)) return 'unknown'
  const field = rule.field as Fact
  const values = new Set([...docs.map(document => document[field]), facts?.[field]].filter(value => value !== undefined))
  if (values.size !== 1) return 'unknown'
  const [value] = values
  const expected = rule.expected_value
  let passes: boolean
  if (rule.operator === 'eq' && typeof value === typeof expected) passes = value === expected
  else if (rule.operator === 'in' && Array.isArray(expected) && expected.every(item => typeof item === typeof value)) passes = expected.includes(value)
  else if (typeof value === 'number' && typeof expected === 'number' && rule.operator === 'gte') passes = value >= expected
  else if (typeof value === 'number' && typeof expected === 'number' && rule.operator === 'lte') passes = value <= expected
  else return 'unknown'
  return passes ? 'matched' : 'failed'
}

export function assessScan(entry: ScanCatalogueEntry, docs: ConfirmedDocument[], today = indiaToday(), facts?: EligibilityFacts) {
  const checks = entry.rules.map(rule => ({ rule, status: checkRule(rule, docs, facts) }))
  const failed = checks.filter(check => check.status === 'failed')
  const unknown = checks.filter(check => check.status === 'unknown')
  const matched = checks.filter(check => check.status === 'matched')
  let status: Status = 'insufficient_information'
  if (failed.length) status = 'not_eligible'
  else if (matched.length && !unknown.length) status = entry.partial_rule_coverage ? 'potentially_eligible' : 'eligible'

  const requirements = entry.requirements.map(requirement => {
    const matching = docs.filter(document => requirement.accepted_categories.includes(document.type))
    const ready = matching.some(document => !document.confirmationPending && (!document.expiresOn || document.expiresOn >= today))
    const state = ready ? 'ready' : matching.some(document => document.confirmationPending) ? 'review'
      : matching.length ? 'expired' : requirement.accepted_categories.length ? 'missing' : 'manual'
    const conflicts = [...new Set(matching.flatMap(document => document.reviewFields?.map(field => document.type + ' · ' + field) ?? []))]
    return { requirement, state, recognized: matching.length > 0, conflicts }
  })
  const required = requirements.filter(item => item.requirement.required_status === 'required')
  const ready = required.filter(item => item.state === 'ready').length
  return { status, checks, matched, failed, unknown, requirements, required: required.length, ready,
    percentage: required.length ? Math.round(100 * ready / required.length) : null }
}
