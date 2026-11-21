export interface Service {
  id: number
  slug: string
  name: string
  description: string
  category: string
  browse_category: string | null
  subcategory: string | null
  jurisdiction: 'Central' | 'State'
  state: string | null
  department: string | null
  official_url: string | null
  verification_status: 'verified' | 'unverified'
  last_verified_at: string | null
  created_at: string
  updated_at: string
}

export interface ServiceSource {
  id: number
  source_url: string
  source_title: string
  source_type: string
  checked_at: string | null
}

export interface CatalogueDetails {
  origin: string
  overview: string
  benefits: string[]
  eligibility_guidance: string[]
  procedure: string[]
  official_information_url: string | null
  official_application_url: string | null
  application_opens: string | null
  application_deadline: string | null
  application_status: string | null
  previous_application_period: string | null
  previous_eligibility: string | null
}

export interface ScanRule {
  field: string
  operator: string
  expected_value: unknown
  explanation: string
  source: ServiceSource
}

export interface ScanRequirement {
  id: number
  document_name: string
  required_status: 'required' | 'optional' | 'conditional'
  accepted_categories: string[]
  source: ServiceSource
}

export interface ScanCatalogueEntry {
  service: Service
  rules: ScanRule[]
  requirements: ScanRequirement[]
  partial_rule_coverage: boolean
}

export interface ServiceDetail extends Service {
  sources: ServiceSource[]
  catalogue: CatalogueDetails | null
}

export interface ServiceDocuments {
  verification_status: Service['verification_status']
  items: {
    id: number
    document_name: string
    required_status: 'required' | 'optional' | 'conditional'
    source: ServiceSource
  }[]
}

export interface ServiceDependencies {
  verification_status: Service['verification_status']
  items: {
    id: number
    prerequisite_service: Service
    condition: string | null
    source: ServiceSource
  }[]
}

export interface ServicePage {
  items: Service[]
  total: number
  page: number
  page_size: number
}

export interface JourneyTask {
  id: string
  title: string
  status: 'pending' | 'complete'
  sort_order: number
  completed_at: string | null
}

export interface Journey {
  id: string
  service_id: number
  service_slug: string
  status: 'in_progress' | 'complete'
  created_at: string
  updated_at: string
  tasks: JourneyTask[]
}

export interface DraftFields {
  title: string
  department: string | null
  description: string
}

export interface GrievanceDraft extends DraftFields {
  id: string
  draft_text: string
  local_status: 'draft' | 'ready' | 'archived'
  official_reference_number: string | null
  created_at: string
  updated_at: string
}

export const baseUrl = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function request<T>(path: string, init: RequestInit = {}, workspace = false): Promise<T> {
  let response: Response
  try {
    response = await fetch(baseUrl + path, {
      ...init,
      credentials: workspace ? 'include' : 'omit',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new ApiError('Could not connect to the SevaPath API. Try again when the backend is running.', 0)
  }

  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok || data === null) {
    const message = data?.error?.message
    const fallback = response.status >= 500
      ? 'Could not connect to the SevaPath API. Check that the backend is running and try again.'
      : 'The SevaPath API did not return a usable response. Try again.'
    throw new ApiError(typeof message === 'string' ? message : fallback, response.status, data?.error?.code)
  }
  return data as T
}

let sessionRequest: Promise<void> | undefined

function startSession() {
  // Share a pending bootstrap among concurrent requests so they use the same cookie.
  sessionRequest ??= request<void>('/session', { method: 'POST' }, true)
    .finally(() => { sessionRequest = undefined })
  return sessionRequest
}

async function workspaceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(path, init, true)
  } catch (error) {
    if (!(error instanceof ApiError && error.code === 'session_required') || init.signal?.aborted) throw error
    await startSession()
    return request<T>(path, init, true)
  }
}

function listServices(query = '', signal?: AbortSignal) {
  return request<ServicePage>('/services' + (query ? '?' + query : ''), { signal })
}

export const api = {
  services: listServices,
  scanCatalogue: (_key: string, signal: AbortSignal) => request<ScanCatalogueEntry[]>('/services/scan-catalogue', { signal }),
  async allServices(_key: string, signal: AbortSignal) {
    const first = await listServices('page_size=50', signal)
    const items = [...first.items]
    const pages = Math.ceil(first.total / first.page_size)
    for (let page = 2; page <= pages; page++) {
      const next = await listServices('page_size=50&page=' + page, signal)
      items.push(...next.items)
    }
    return items
  },
  serviceDocuments(slug: string, signal: AbortSignal) {
    return request<ServiceDocuments>('/services/' + encodeURIComponent(slug) + '/documents', { signal })
  },
  serviceDependencies(slug: string, signal: AbortSignal) {
    return request<ServiceDependencies>('/services/' + encodeURIComponent(slug) + '/dependencies', { signal })
  },
  service(slug: string, signal?: AbortSignal) {
    return request<ServiceDetail>('/services/' + encodeURIComponent(slug), { signal })
  },
  journeys(_key: string, signal: AbortSignal) {
    return workspaceRequest<Journey[]>('/journeys', { signal })
  },
  async journeyPreview(_key: string, signal: AbortSignal) {
    try {
      return await request<Journey[]>('/journeys', { signal }, true)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'session_required') return []
      throw error
    }
  },
  startJourney(serviceSlug: string) {
    return workspaceRequest<Journey>('/journeys', { method: 'POST', body: JSON.stringify({ service_slug: serviceSlug }) })
  },
  updateTask(journeyId: string, taskId: string, completed: boolean) {
    return workspaceRequest<Journey>('/journeys/' + journeyId + '/tasks/' + taskId, {
      method: 'PATCH', body: JSON.stringify({ completed }),
    })
  },
  grievances(_key: string, signal: AbortSignal) {
    return workspaceRequest<GrievanceDraft[]>('/grievances', { signal })
  },
  saveDraft(fields: DraftFields, requestId: string, draftId?: string) {
    return workspaceRequest<GrievanceDraft>(draftId ? '/grievances/' + draftId : '/grievances', {
      method: draftId ? 'PATCH' : 'POST',
      body: JSON.stringify(draftId ? fields : { ...fields, request_id: requestId }),
    })
  },
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'SevaPath could not complete this request.'
}
