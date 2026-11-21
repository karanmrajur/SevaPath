import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { ApiError } from './api'
import { Catalog } from './catalog'
import { citizenApi } from './citizen-api'
import { CitizenAssistant } from './citizen-assistant'
import { CitizenProvider, useCitizen } from './citizen-context'
import { CitizenCentres } from './citizen-centres'
import { CitizenHelp } from './citizen-help'
import { CitizenJourney } from './citizen-journey'
import { CitizenProfile, CitizenRequiredDetails } from './citizen-profile'
import { CitizenSettings } from './citizen-settings'
import { CitizenDirectory, CitizenEligibility, CitizenServiceDetail, SaveService } from './citizen-discovery'
import { CitizenHome } from './citizen-home'
import { CitizenLayout } from './citizen-layout'
import { CitizenApplications, CitizenDocuments, CitizenGrievances, CitizenPlanner } from './citizen-records'
import { CitizenPrivacy, CitizenTerms } from './citizen-support'
import { ConnectionError, EmptyState, Loading } from './components'
import { useApi } from './use-api'
import './citizen.css'

const DocumentScan = lazy(() => import('./document-scan'))
const DocumentConsistency = lazy(() => import('./document-consistency'))

function CitizenCatalogue() {
  const { workspace } = useCitizen()
  return <Catalog base="/dashboard" saved={workspace.data?.saved} renderServiceAction={service => <SaveService service={service} />} />
}

export function CitizenEntry() {
  const { pathname, search, hash } = useLocation()
  const signIn = <Navigate to="/login" replace state={{ next: pathname + search + hash }} />
  const account = useApi(citizenApi.me)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    const expire = () => setExpired(true)
    window.addEventListener('sevapath-account-expired', expire)
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('sevapath-session-state')
    channel?.addEventListener('message', event => { if (event.data === 'signed-out') expire() })
    return () => {
      window.removeEventListener('sevapath-account-expired', expire)
      channel?.close()
    }
  }, [])
  if (expired) return signIn
  if (account.loading) return <div className="citizen-gate"><Loading /></div>
  if (account.error instanceof ApiError && account.error.status === 401) return signIn
  if (account.error != null) return <div className="citizen-gate"><ConnectionError error={account.error} retry={account.retry} /><Link className="text-link" to="/">Back to SevaPath</Link></div>
  if (!account.data) return signIn

  return <CitizenProvider citizen={account.data}><Routes>
    <Route element={<CitizenLayout />}>
      <Route index element={<CitizenHome />} />
      <Route path="services" element={<CitizenCatalogue />} />
      <Route path="services/:serviceId" element={<CitizenServiceDetail />} />
      <Route path="eligibility" element={<CitizenEligibility />} />
      <Route path="assistant" element={<CitizenAssistant />} />
      <Route path="scholarships" element={<CitizenDirectory key="scholarships" scholarships />} />
      <Route path="planner" element={<CitizenPlanner />} />
      <Route path="centres" element={<CitizenCentres />} />
      <Route path="grievances" element={<CitizenGrievances />} />
      <Route path="documents" element={<CitizenDocuments />} />
      <Route path="documents/scan" element={<Suspense fallback={<Loading />}><DocumentScan /></Suspense>} />
      <Route path="documents/consistency" element={<Suspense fallback={<Loading />}><DocumentConsistency /></Suspense>} />
      <Route path="applications" element={<CitizenApplications />} />
      <Route path="profile" element={<CitizenProfile />} />
      <Route path="required-details" element={<CitizenRequiredDetails />} />
      <Route path="journey" element={<CitizenJourney />} />
      <Route path="help" element={<CitizenHelp />} />
      <Route path="settings" element={<CitizenSettings />} />
      <Route path="terms" element={<CitizenTerms />} />
      <Route path="privacy" element={<CitizenPrivacy />} />
      <Route path="contact" element={<CitizenHelp />} />
      <Route path="*" element={<EmptyState title="Dashboard page unavailable" action={<Link className="button button-outline" to="/dashboard">Back to dashboard</Link>}>Choose a workspace area from the sidebar.</EmptyState>} />
    </Route>
  </Routes></CitizenProvider>
}
