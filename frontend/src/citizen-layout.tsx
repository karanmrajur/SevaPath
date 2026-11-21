import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Accessibility, Bell, BookOpen, ChevronDown, ClipboardCheck, Contact, FileText, GraduationCap,
  House, LayoutGrid, LogOut, MapPin, Menu, MessageSquareText, Mic, Moon, Route, Search, ShieldCheck, Sun, X,
  CircleHelp, Info, UserRound, Settings, ListChecks,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { errorMessage } from './api'
import { citizenApi } from './citizen-api'
import { useCitizen } from './citizen-context'
import { Brand, Notice } from './components'
import { guidedKeyword } from './data'
import { usePortalPreferences } from './portal-preferences'
import { Avatar, useProfilePhoto } from './citizen-profile'
import { useApi } from './use-api'

const sections = [
  ['', 'Home', 'होम', House],
  ['services', 'Services', 'सेवाएँ', LayoutGrid],
  ['eligibility', 'Eligible Schemes', 'पात्र योजनाएँ', ClipboardCheck],
  ['assistant', 'AI Life Navigator', 'AI जीवन मार्गदर्शक', Mic],
  ['scholarships', 'Scholarships', 'छात्रवृत्तियाँ', GraduationCap],
  ['planner', 'Action Planner', 'सेवा योजनाकार', Route],
  ['centres', 'Seva Sindhu Centres', 'सेवा सिंधु केंद्र', MapPin],
  ['grievances', 'Grievance Assistant & Tracker', 'शिकायत सहायक', MessageSquareText],
  ['documents', 'Document Wallet', 'दस्तावेज़ वॉलेट', FileText],
  ['documents/consistency#local-preparation', 'Pre-Rejection Shield', 'आवेदन की तैयारी', ShieldCheck],
  ['documents/consistency?view=passport#local-preparation', 'Eligibility Passport', 'पात्रता पासपोर्ट', ClipboardCheck],
  ['documents/consistency?view=radar#local-preparation', 'Benefit Radar', 'लाभ खोजें', Search],
  ['applications', 'My Applications', 'मेरे आवेदन', BookOpen],
  ['journey', 'My Journey', 'मेरी यात्रा', Route],
] as const

const profileLinks = [
  ['/dashboard/profile', 'My Profile', UserRound],
  ['/dashboard/required-details', 'Required Details', ListChecks],
  ['/dashboard/documents', 'My Documents', FileText],
  ['/dashboard/journey', 'My Journey', Route],
  ['/dashboard/help', 'Help Centre', CircleHelp],
  ['/dashboard/services', 'Services Directory', LayoutGrid],
  ['/#about', 'About Us', Info],
  ['/dashboard/settings', 'Settings', Settings],
] as const

function startingTheme() {
  try { return localStorage.getItem('sevapath-citizen-theme') === 'dark' } catch { return false }
}

export function dashboardSearch(value: string) {
  const keyword = guidedKeyword(value)
  return '/dashboard/services' + (keyword ? '?' + new URLSearchParams({ q: keyword }) : '')
}

export function CitizenLayout() {
  const { pathname, search: currentSearch, hash } = useLocation()
  const navigate = useNavigate()
  const { citizen, catalogue, saveError, workspace, photoVersion, walletOpen, inventoryVersion } = useCitizen()
  const source = useProfilePhoto(citizen.has_photo, photoVersion)
  const expiry = useApi(citizenApi.expiry, '', walletOpen && citizen.settings.notifications && citizen.settings.expiry_alerts, inventoryVersion)
  const accountMenu = useRef<HTMLDetailsElement>(null)
  const { language, setLanguage, fontSize, setFontSize, label } = usePortalPreferences()
  const [dark, setDark] = useState(startingTheme)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const drawer = useRef<HTMLElement>(null)
  const reminders = workspace.data?.reminders ?? []
  const signOut = async () => {
    setLoggingOut(true)
    setActionError('')
    try { await citizenApi.logout(); navigate('/', { replace: true }) }
    catch (error) { setActionError(errorMessage(error)); setLoggingOut(false) }
  }

  useEffect(() => {
    if (citizen.settings.language) setLanguage(citizen.settings.language)
  }, [citizen.settings.language])

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      const menu = accountMenu.current
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])

  useEffect(() => {
    try { localStorage.setItem('sevapath-citizen-theme', dark ? 'dark' : 'light') } catch { /* Theme applies until reload. */ }
  }, [dark])

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 900px)')
    const reset = () => { if (!mobile.matches) setMobileOpen(false) }
    mobile.addEventListener('change', reset)
    return () => mobile.removeEventListener('change', reset)
  }, [])

  function closeDrawer() {
    setMobileOpen(false)
    requestAnimationFrame(() => menuButton.current?.focus())
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate(dashboardSearch(String(new FormData(event.currentTarget).get('global-search') ?? '')))
  }

  return (
    <div className="citizen-shell" data-theme={dark ? 'dark' : 'light'} onKeyDown={event => {
      if (event.key === 'Escape' && mobileOpen) closeDrawer()
      if (event.key !== 'Escape') return
      const menu = (event.target as HTMLElement).closest('details[open]')
      const trigger = menu?.querySelector('summary')
      if (menu && trigger) { menu.removeAttribute('open'); trigger.focus() }
    }}>
      <a className="citizen-skip" href="#citizen-content">{label('Skip to dashboard content', 'मुख्य सामग्री पर जाएँ')}</a>
      {mobileOpen && <button className="citizen-overlay" type="button" aria-hidden="true" tabIndex={-1} onClick={closeDrawer} />}
      <aside ref={drawer} id="citizen-navigation" className={'citizen-sidebar' + (mobileOpen ? ' is-open' : '')}>
        <Link className="citizen-brand" to="/dashboard" onClick={() => setMobileOpen(false)}><Brand /><span>{label('Citizen workspace', 'नागरिक कार्यक्षेत्र')}</span></Link>
        <button className="citizen-icon citizen-drawer-close" type="button" aria-label="Close navigation" onClick={closeDrawer}><X size={18} /></button>
        <nav aria-label="Citizen navigation">
          {sections.map(([to, title, hindi, Icon]) => {
            const destination = '/dashboard' + (to ? '/' + to : '')
            const content = <><Icon size={18} aria-hidden="true" /><span>{label(title, hindi)}</span></>
            const close = () => setMobileOpen(false)
            if (to.includes('#')) {
              const currentView = new URLSearchParams(currentSearch).get('view')
              const view = new URLSearchParams(destination.split('?')[1]?.split('#')[0]).get('view')
              const active = pathname === '/dashboard/documents/consistency' && hash === '#local-preparation' && currentView === view
              return <Link key={to} to={destination} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined} onClick={close}>{content}</Link>
            }
            return <NavLink key={to} to={destination} end={!to || to === 'documents'} onClick={close}>{content}</NavLink>
          })}
        </nav>
        <nav className="citizen-sidebar-footer" aria-label="Project information">
          <Link to="/dashboard/terms" onClick={() => setMobileOpen(false)}><FileText size={16} aria-hidden="true" />{label('Terms of Service', 'सेवा की शर्तें')}</Link>
          <Link to="/dashboard/privacy" onClick={() => setMobileOpen(false)}><ShieldCheck size={16} aria-hidden="true" />{label('Privacy Policy', 'गोपनीयता नीति')}</Link>
          <Link to="/dashboard/contact" onClick={() => setMobileOpen(false)}><Contact size={16} aria-hidden="true" />{label('Contact Us', 'संपर्क करें')}</Link>
        </nav>
      </aside>
      <div className="citizen-main" inert={mobileOpen}>
        <header className="citizen-topbar">
          <button ref={menuButton} className="citizen-icon citizen-menu" type="button" aria-expanded={mobileOpen} aria-controls="citizen-navigation"
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} onClick={() => {
              if (mobileOpen) setMobileOpen(false)
              else { setMobileOpen(true); requestAnimationFrame(() => drawer.current?.querySelector<HTMLElement>('a')?.focus()) }
            }}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
          <Link className="citizen-topbrand" to="/dashboard" aria-label="SevaPath dashboard"><Brand /></Link>
          <form className="citizen-global-search" role="search" aria-label="Global service search" onSubmit={search}>
            <label className="sr-only" htmlFor="citizen-global-search">{label('Search government services', 'सरकारी सेवाएँ खोजें')}</label>
            <input id="citizen-global-search" name="global-search" type="search" maxLength={120} placeholder={label('Search government services', 'सरकारी सेवाएँ खोजें')} />
            <button className="citizen-icon" type="submit" aria-label="Search"><Search size={19} /></button>
          </form>
          <div className="citizen-top-actions">
            <label className="citizen-language"><span className="sr-only">Language</span><select value={language} onChange={event => setLanguage(event.target.value === 'hi' ? 'hi' : 'en')}><option value="en">English</option><option value="hi" lang="hi">हिन्दी</option></select></label>
            <details className="citizen-dropdown"><summary className="citizen-icon" aria-label="Accessibility"><Accessibility size={19} /></summary><div className="citizen-popover"><strong>Text size</strong><div className="button-row">{([90, 100, 112.5] as const).map((size, i) => <button key={size} type="button" className="button button-outline" aria-pressed={fontSize === size} onClick={() => setFontSize(size)}>{['A−', 'A', 'A+'][i]}</button>)}</div></div></details>
            <details className="citizen-dropdown"><summary className="citizen-icon" aria-label="Notifications"><Bell size={18} /></summary><div className="citizen-popover"><strong>Notifications</strong><p>{citizen.settings.notifications ? 'No confirmed deadlines are available.' : 'Dashboard notifications are turned off.'}</p>{!!expiry.data?.length && <Link className="text-link" to="/dashboard/documents">{expiry.data.length} document expiry {expiry.data.length === 1 ? 'reminder' : 'reminders'}</Link>}{citizen.settings.notifications && reminders.length > 0 && <><p>On your watchlist</p><ul>{reminders.map(slug => <li key={slug}><Link className="text-link" to={'/dashboard/services/' + slug}>{catalogue.data?.find(service => service.slug === slug)?.name ?? slug}</Link></li>)}</ul></>}<Link className="text-link" to="/dashboard/planner">Open scheme planner</Link></div></details>
            <button type="button" className="citizen-icon" onClick={() => setDark(value => !value)} aria-pressed={dark} aria-label="Dark theme">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
            <details key={pathname} ref={accountMenu} className="citizen-dropdown">
              <summary className="citizen-profile" aria-label="Profile menu"><span><Avatar source={source} size={17} /></span><b>{citizen.name}</b><ChevronDown size={15} /></summary>
              <div className="citizen-popover citizen-profile-popover">
                <div className="citizen-profile-summary"><div className="profile-portrait"><Avatar source={source} size={22} /></div><div><strong>{citizen.name}</strong><p>{citizen.email}</p></div></div>
                <nav aria-label="Profile navigation">{profileLinks.map(([to, title, Icon]) =>
                  <Link key={to} to={to} onClick={() => { if (accountMenu.current) accountMenu.current.open = false }}>
                    <Icon size={17} aria-hidden="true" />{title}
                  </Link>
                )}</nav>
                <button className="button button-outline" type="button" disabled={loggingOut} onClick={() => void signOut()}><LogOut size={16} /> Logout</button>
              </div>
            </details>
          </div>
        </header>
        <div className="citizen-content" id="citizen-content" tabIndex={-1}>
          {actionError && <Notice><span role="alert">{actionError}</span></Notice>}
          {saveError && <Notice><span role="alert">{saveError}</span></Notice>}
          <Outlet />
        </div>
      </div>
    </div>
  )
}
