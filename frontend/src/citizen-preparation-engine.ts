import type { ScanCatalogueEntry } from './api.ts'
import type { ReviewData } from './document-consistency-engine.ts'
import { comparisons, latestDecision } from './document-consistency-engine.ts'
import { assessScan, indiaToday, type ConfirmedDocument, type EligibilityFacts } from './document-scan-engine.ts'

export const preparationSteps = [
  ['official', 'Review the current process and deadline on the official portal'],
  ['fields', 'Complete and check the mandatory fields on the official form'],
  ['additional', 'Check applicable conditional documents and prerequisite services'],
] as const

export type PreparationStep = typeof preparationSteps[number][0] | `prerequisite:${number}`
export type Interest = 'all' | 'education' | 'farmers' | 'seniors' | 'families'

export function findOpportunities(entries: ScanCatalogueEntry[], documents: ConfirmedDocument[], interest: Interest, facts?: EligibilityFacts, state?: string) {
  const terms: Record<Interest, RegExp> = {
    all: /./u, education: /educat|scholarship|student/u, farmers: /farmer|agricult/u,
    seniors: /senior|old age|pension/u, families: /family|families|household|parent|child|materni/u,
  }
  return entries.filter(({ service }) => service.verification_status === 'verified'
    && (!state || !service.state || state.toLowerCase() === service.state.toLowerCase())
    && terms[interest].test([service.name, service.description, service.category, service.browse_category, service.subcategory].join(' ').toLowerCase()))
    .map(entry => ({ entry, assessment: assessScan(entry, documents, undefined, facts) }))
    .sort((a, b) => {
      const rank = { eligible: 0, potentially_eligible: 1, insufficient_information: 2, not_eligible: 3 }
      return rank[a.assessment.status] - rank[b.assessment.status] || a.entry.service.name.localeCompare(b.entry.service.name)
    })
}

export function openReviews(data: ReviewData) {
  return comparisons(data.records).filter(group => group.status !== 'MATCH'
    && (group.status !== 'MISSING_INFORMATION' || group.field === 'name')
    && !latestDecision(data, group.key)?.value)
}

export function preflight(assessment: ReturnType<typeof assessScan>, inputs: {
  openReviews: number; steps: readonly PreparationStep[]; partial: boolean; currentCatalogue: boolean;
  dependenciesChecked: boolean; dependenciesPending: number
}) {
  const missing = assessment.requirements.filter(item => item.requirement.required_status === 'required'
    && (item.state === 'missing' || item.state === 'expired'))
  const review = assessment.requirements.some(item => item.requirement.required_status === 'required'
    && (item.state === 'review' || item.state === 'manual'))
  const tracked = preparationSteps.filter(([step]) => inputs.steps.includes(step)).length
  const prerequisitesPending = inputs.dependenciesPending > 0
  const known = assessment.required > 0 && assessment.checks.length > 0
  const status = missing.length || assessment.failed.length || prerequisitesPending ? 'Action required'
    : inputs.openReviews || review || (known && (assessment.unknown.length || inputs.partial || tracked < preparationSteps.length))
      ? 'Manual review required'
      : !known || !inputs.currentCatalogue || !inputs.dependenciesChecked ? 'Information unavailable'
        : 'Ready based on verified requirements'
  return { status, missing, progress: Math.round(100 * tracked / preparationSteps.length) }
}

export function expiryState(document: ConfirmedDocument, reminderDays: number, today = indiaToday()) {
  if (document.reviewFields?.includes('Certificate expiry date')) return 'Manual verification required'
  if (!document.expiresOn) return 'Expiry unknown'
  const days = (Date.parse(document.expiresOn) - Date.parse(today)) / 86_400_000
  return days < 0 ? 'Expired' : days <= reminderDays ? 'Expiring soon' : 'Valid according to confirmed date'
}
