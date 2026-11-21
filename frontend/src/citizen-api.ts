import { ApiError, baseUrl, request, type DraftFields, type GrievanceDraft, type Journey } from './api'

export interface Profile {
  title: string
  first_name: string
  middle_name: string
  surname: string
  date_of_birth: string | null
  gender: string
  parent_name: string
  guardian_name: string
  marital_status: string
  nationality: string
  taluk: string
  city: string
  pin_code: string
  area: string
  temporary_address: string
  permanent_address: string
  same_as_permanent: boolean
  parent_occupation: string
  annual_household_income: number | null
  employment: string
  disability: boolean | null
  religion: string
  caste: string
  reservation_category: string
  sensitive_scheme: string
  ration_status: string
  state: string
  district: string
  age: number | null
  occupation: string
  education: string
  income_range: string
  student: boolean | null
  farmer: boolean | null
  landholding: boolean | null
  gruha_lakshmi_household_head: boolean | null
  dependent: { label: string; education: string; consent: true } | null
}

export interface Citizen {
  name: string
  email: string
  mobile: string
  has_photo: boolean
  settings: CitizenSettings
  profile: Profile
}

export interface CitizenSettings {
  language: 'en' | 'hi' | null
  notifications: boolean
  expiry_alerts: boolean
}

export interface Wallet {
  unlocked_until: string | null
  local_review_scope: string | null
  uses_mpin: boolean
  encrypted_storage: boolean
}

export interface CentrePoint { id: string; latitude: number; longitude: number }
export type CentreType = 'Seva Sindhu' | 'Karnataka One' | 'Grama One' | 'Bangalore One' | 'Other citizen service centre'
export interface Centre {
  id: string
  name: string
  address: string
  city: string
  district: string
  pin: string | null
  operator: string | null
  phone: string | null
  source: string
  verified_on: string
  centre_type: CentreType
  aliases: string[]
  coordinates: {
    latitude: number
    longitude: number
    confidence: 'official_site' | 'matched_site'
    source: string
  } | null
}

export interface ExpiryAlert {
  document: CitizenDocument
  days_left: number
  milestone: 30 | 15 | 7
}

export const applicationStatuses = ['Preparing', 'Submitted', 'In progress', 'Approved', 'Rejected', 'Closed'] as const
export const grievanceStatuses = ['Draft', 'Submitted', 'In progress', 'Resolved', 'Escalated'] as const
export const preparationTasks = ['Review eligibility information', 'Prepare required documents', 'Review the official application process']

export interface Application {
  title: string
  reference: string
  submission_date: string | null
  status: typeof applicationStatuses[number]
  next_step: string
  tasks: boolean[]
  applicant_name?: string
  applicant_contact?: string
  updated_at?: string | null
}

export interface GrievanceReport {
  reference: string
  submission_date: string | null
  status: typeof grievanceStatuses[number]
  next_step: string
}

export interface CitizenWorkspace {
  version: number
  saved: string[]
  saved_at: Record<string, string>
  recent: string[]
  reminders: string[]
  checklist: Record<string, 'ready' | 'missing' | 'unchecked'>
  applications: Record<string, Application>
  grievances: Record<string, GrievanceReport>
}

export interface EligibilityAssessment {
  slug: string
  status: 'Likely Eligible' | 'Not Eligible' | 'Needs More Information'
  assessment_state: 'eligible' | 'potentially_eligible' | 'not_eligible' | 'insufficient_information'
  met: number
  unmatched: number
  unknown: number
  match_percentage: number | null
  total: number
  checks: { explanation: string; field: string; met: boolean | null; source_url: string }[]
}

export const documentCategories = [
  'Aadhaar Card', 'Caste certificate', 'Income certificate', 'Combined Caste and Income Certificate',
  'Driving Licence', 'PAN Card', 'Voter ID', 'Bank Passbook', 'Ration card', 'Class 10 Marksheet', 'Class 12 Marksheet',
  'Degree / Diploma Certificate', 'Birth Certificate', 'Residence certificate', 'Disability Certificate',
  'RTC / Pahani / Land Records', 'FRUITS ID supporting documents', 'Passport-size Photograph', 'Other',
  'Education marksheet', 'Farmer document', 'Identity proof', 'Address proof', 'Land record', 'Bank records', 'Learner licence',
] as const
export interface CitizenDocument {
  id: string
  name: string
  category: typeof documentCategories[number]
  mime: 'image/jpeg' | 'image/png' | 'application/pdf'
  size: number
  expires_on: string | null
  uploaded_at: string
}

export interface Readiness {
  percentage: number | null
  required: number
  uploaded: number
  items: { requirement: { id: number; document_name: string; required_status: string }; status: 'uploaded' | 'expired' | 'missing' | 'unmapped'; files: CitizenDocument[] }[]
}

async function citizenRequest<T>(path: string, init: RequestInit = {}) {
  try {
    return await request<T>('/citizen' + path, init, true)
  } catch (error) {
    if (path !== '/me' && error instanceof ApiError && error.code === 'account_required') {
      window.dispatchEvent(new Event('sevapath-account-expired'))
    }
    if (error instanceof ApiError && error.code === 'wallet_locked') window.dispatchEvent(new Event('sevapath-wallet-locked'))
    throw error
  }
}

async function privateBlob(path: string, signal?: AbortSignal) {
  const response = await fetch(baseUrl + '/citizen' + path, { credentials: 'include', signal, cache: 'no-store' })
  if (response.status === 423) window.dispatchEvent(new Event('sevapath-wallet-locked'))
  if (response.status === 401) window.dispatchEvent(new Event('sevapath-account-expired'))
  if (!response.ok) throw new ApiError('This private file could not be opened.', response.status)
  return response.blob()
}

async function endSession(path: string, data?: unknown) {
  await submit<void>(path, data)
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('sevapath-session-state')
    channel.postMessage('signed-out')
    channel.close()
  }
}

function submit<T>(path: string, data?: unknown, method = 'POST') {
  return citizenRequest<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) })
}

export const citizenApi = {
  register: (data: { name: string; email: string; mobile: string; password: string }) => submit<Citizen>('/register', data),
  login: (data: { identifier: string; password: string; remember: boolean }) => submit<Citizen>('/login', data),
  logout: () => endSession('/logout'),
  deleteAccount: (password: string) => endSession('/delete-account', { password }),
  me: (_key: string, signal: AbortSignal) => citizenRequest<Citizen>('/me', { signal }),
  updateProfile: (profile: Profile, contacts?: { email: string; mobile: string; password?: string }) => submit<Citizen>('/profile', { ...profile, ...contacts, consent: true }, 'PATCH'),
  wallet: (_key: string, signal: AbortSignal) => citizenRequest<Wallet>('/wallet', { signal }),
  unlock: (credential: string) => submit<Wallet>('/wallet/unlock', { credential }),
  lock: () => submit<void>('/wallet/lock'),
  mpin: (password: string, pin: string | null) => submit<void>('/wallet/mpin', { password, pin }),
  updateSettings: (settings: CitizenSettings) => submit<Citizen>('/settings', settings, 'PATCH'),
  changePassword: (password: string, new_password: string) => endSession('/password', { password, new_password }),
  exportData: (password: string) => submit<unknown>('/export', { password }),
  centres: (_key: string, signal: AbortSignal) => citizenRequest<{ items: Centre[]; distance_available: boolean; mapped_count: number; dataset: 'sourced_snapshot' | 'official_feed' | 'mixed' | 'cached_feed' }>('/centres', { signal }),
  centreCoordinates: () => submit<CentrePoint[]>('/centres/coordinates'),
  expiry: (_key: string, signal: AbortSignal) => citizenRequest<ExpiryAlert[]>('/wallet/expiry', { signal }),
  photo: (signal: AbortSignal) => privateBlob('/photo', signal),
  savePhoto: (name: string, mime: 'image/png' | 'image/jpeg', content: string) =>
    submit<void>('/photo', { name, mime, content, category: 'Passport-size Photograph', consent: true }),
  removePhoto: () => submit<void>('/photo', undefined, 'DELETE'),
  workspace: (_key: string, signal: AbortSignal) => citizenRequest<CitizenWorkspace>('/workspace', { signal }),
  saveWorkspace: (workspace: CitizenWorkspace) => submit<CitizenWorkspace>('/workspace', workspace, 'PATCH'),
  eligibility: (_key: string, signal: AbortSignal) => citizenRequest<EligibilityAssessment[]>('/eligibility', { signal }),
  readiness: (slug: string, signal: AbortSignal) => citizenRequest<Readiness>('/readiness/' + encodeURIComponent(slug), { signal }),
  documents: (_key: string, signal: AbortSignal) => citizenRequest<CitizenDocument[]>('/documents', { signal }),
  upload: (file: Omit<CitizenDocument, 'id' | 'size' | 'uploaded_at'> & { content: string }, replacing?: string) =>
    submit<CitizenDocument>(replacing ? '/documents/' + replacing + '/replace' : '/documents', { ...file, consent: true }),
  deleteDocument: (id: string) => submit<void>('/documents/' + id + '/delete'),
  documentBlob: (id: string, signal?: AbortSignal) => privateBlob('/documents/' + encodeURIComponent(id), signal),
  journeys: (_key: string, signal: AbortSignal) => citizenRequest<Journey[]>('/journeys', { signal }),
  startJourney: (slug: string) => submit<Journey>('/journeys', { service_slug: slug }),
  updateTask: (journey: string, task: string, completed: boolean) => submit<Journey>('/journeys/' + journey + '/tasks/' + task, { completed }, 'PATCH'),
  grievances: (_key: string, signal: AbortSignal) => citizenRequest<GrievanceDraft[]>('/grievances', { signal }),
  saveDraft: (fields: DraftFields, draftId?: string) => submit<GrievanceDraft>(
    draftId ? '/grievances/' + draftId : '/grievances', draftId ? fields : { ...fields, request_id: crypto.randomUUID() }, draftId ? 'PATCH' : 'POST',
  ),
}
