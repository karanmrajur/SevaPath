import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { api, ApiError, errorMessage } from './api'
import { citizenApi, type Citizen, type CitizenDocument, type CitizenWorkspace } from './citizen-api'
import { useApi } from './use-api'
import type { ReviewData } from './document-consistency-engine'
import type { LocalAssistantReport } from './jansetu-api'

export type WalletScan = Pick<CitizenDocument, 'id' | 'category' | 'mime'>

function useCitizenState(initial: Citizen) {
  const [citizen, setCitizen] = useState(initial)
  const workspace = useApi(citizenApi.workspace)
  const catalogue = useApi(api.allServices)
  const wallet = useApi(citizenApi.wallet)
  const [walletScan, setWalletScan] = useState<WalletScan>()
  const [temporaryReview, setTemporaryReview] = useState<ReviewData>()
  const [assistantReport, setAssistantReport] = useState<LocalAssistantReport>()
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname !== '/dashboard/documents/consistency') setWalletScan(undefined)
  }, [pathname])
  const [photoVersion, setPhotoVersion] = useState(0)
  const photoChanged = () => setPhotoVersion(value => value + 1)
  const [inventoryVersion, setInventoryVersion] = useState(0)
  const inventoryChanged = () => setInventoryVersion(value => value + 1)
  const unlockedUntil = wallet.data?.unlocked_until
  const walletOpen = !!unlockedUntil && Date.parse(unlockedUntil) > Date.now()

  useEffect(() => {
    if (!walletOpen) setAssistantReport(undefined)
    if (!walletOpen || (pathname !== '/dashboard/documents' && pathname !== '/dashboard/documents/consistency')) {
      setTemporaryReview(undefined)
    }
  }, [walletOpen, pathname])

  useEffect(() => {
    const clear = () => { setTemporaryReview(undefined); setAssistantReport(undefined) }
    window.addEventListener('pagehide', clear)
    return () => window.removeEventListener('pagehide', clear)
  }, [])

  useEffect(() => {
    function refreshWallet() { setAssistantReport(undefined); wallet.retry() }
    window.addEventListener('sevapath-wallet-locked', refreshWallet)
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('sevapath-wallet-state')
    channel?.addEventListener('message', refreshWallet)
    return () => {
      window.removeEventListener('sevapath-wallet-locked', refreshWallet)
      channel?.close()
    }
  }, [wallet.retry])

  useEffect(() => {
    if (!unlockedUntil) return
    const remaining = () => Date.parse(unlockedUntil) - Date.now()
    const expire = () => { if (remaining() <= 0) wallet.retry() }
    const timer = window.setTimeout(expire, Math.max(0, remaining()) + 10)
    document.addEventListener('visibilitychange', expire)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', expire)
    }
  }, [unlockedUntil, wallet.retry])

  function refreshWallet() {
    setAssistantReport(undefined)
    wallet.retry()
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('sevapath-wallet-state')
      channel.postMessage('refresh')
      channel.close()
    }
  }
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const working = useRef(false)
  const latest = useRef<CitizenWorkspace | undefined>(undefined)

  useEffect(() => {
    if (workspace.data && (!latest.current || workspace.data.version >= latest.current.version)) latest.current = workspace.data
  }, [workspace.data])

  async function save(change: (current: CitizenWorkspace) => CitizenWorkspace) {
    if (!workspace.data || working.current) return false
    working.current = true
    setSaving(true)
    setSaveError('')
    try {
      const updated = await citizenApi.saveWorkspace(change(latest.current ?? workspace.data))
      latest.current = updated
      workspace.setData(updated)
      return true
    } catch (error) {
      setSaveError(errorMessage(error))
      if (error instanceof ApiError && error.status === 409) {
        latest.current = undefined
        workspace.retry()
      }
      return false
    } finally {
      working.current = false
      setSaving(false)
    }
  }

  return { citizen, setCitizen, workspace, catalogue, saving, saveError, save, wallet, walletOpen, refreshWallet, walletScan, setWalletScan, temporaryReview, setTemporaryReview, assistantReport: walletOpen ? assistantReport : undefined, setAssistantReport, inventoryVersion, inventoryChanged, photoVersion, photoChanged }
}

const Context = createContext<ReturnType<typeof useCitizenState> | null>(null)

export function CitizenProvider({ citizen, children }: { citizen: Citizen; children: ReactNode }) {
  return <Context.Provider value={useCitizenState(citizen)}>{children}</Context.Provider>
}

export function useCitizen() {
  const state = useContext(Context)
  if (!state) throw new Error('Citizen workspace is unavailable.')
  return state
}

export function toggleItem(items: string[], slug: string) {
  return items.includes(slug) ? items.filter(item => item !== slug) : [...items, slug]
}
