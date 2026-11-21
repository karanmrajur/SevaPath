import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { LocateFixed, MapPin, Search, X } from 'lucide-react'
import { citizenApi, type CentreType } from './citizen-api'
import {
  directionsUrl, findCentres, locateDevice, mapFallbackUrl, radii,
  type LocationFix, type LocationResult, type MapMode, type Radius, type SortOrder, type TravelMode,
} from './centre-locator'
import { ConnectionError, EmptyState, Loading, Notice, PageHeader, StatusBadge } from './components'
import { useApi } from './use-api'
import './centre-locator.css'

const CentreMap = lazy(() => import('./centre-map'))
const directory = 'https://sevasindhu.karnataka.gov.in/Sevasindhu/Servicecenters'
const satelliteKey = import.meta.env.VITE_MAPTILER_BROWSER_KEY?.trim()
const provenance = {
  official_feed: 'Official Seva Sindhu feed, refreshed periodically, with supplemental district listings.',
  mixed: 'Recent government listings and saved official records. Some directory groups could not be refreshed.',
  cached_feed: 'Cached government listings. The official directory could not be refreshed.',
  sourced_snapshot: 'Bundled snapshot of government listings.',
}
const centreTypes: CentreType[] = ['Seva Sindhu', 'Karnataka One', 'Grama One', 'Bangalore One', 'Other citizen service centre']
const messages = {
  denied: 'Location permission was denied. Allow access in your browser settings or search by PIN code, city or district.',
  timeout: 'Finding your location timed out. Try again or search by PIN code, city or district.',
  unavailable: 'Your device could not determine its location. Try again or use manual search.',
  unsupported: 'Location is unavailable in this browser or connection. Search by PIN code, city or district.',
}

export function CitizenCentres() {
  const response = useApi(citizenApi.centres)
  const [query, setQuery] = useState('')
  const [searchText, setSearchText] = useState('')
  const [visibleCount, setVisibleCount] = useState(12)
  const [type, setType] = useState<CentreType | ''>('')
  const [mode, setMode] = useState<MapMode>('roadmap')
  const [travelMode, setTravelMode] = useState<TravelMode>('driving')
  const [sort, setSort] = useState<SortOrder>('distance')
  const [radius, setRadius] = useState<Radius>(5)
  const [nearby, setNearby] = useState(false)
  const [location, setLocation] = useState<LocationResult>()
  const [locating, setLocating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const requestId = useRef(0)
  const mapSection = useRef<HTMLElement>(null)
  const position: LocationFix | undefined = location?.state === 'found' ? location.point : undefined

  useEffect(() => () => { requestId.current++ }, [])

  const result = useMemo(() => findCentres(response.data?.items ?? [], { query, type, sort,
    origin: position, radius: nearby ? radius : undefined,
  }), [response.data, query, type, sort, position, nearby, radius])
  const active = result.items.find(item => item.id === selected)
  const locationIssue = location && location.state !== 'found' ? messages[location.state] : undefined

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setQuery(searchText.trim())
    setVisibleCount(12)
    setNearby(false)
    setSelected(null)
  }

  async function requestLocation() {
    const pending = ++requestId.current
    setLocating(true)
    setLocation(undefined)
    setSelected(null)
    const next = await locateDevice(navigator.geolocation)
    if (pending !== requestId.current) return
    setLocation(next)
    setLocating(false)
    setNearby(next.state === 'found')
    if (next.state === 'found') {
      setQuery('')
      setSearchText('')
      setVisibleCount(12)
    }
  }

  function clearLocation() {
    requestId.current++
    setLocating(false)
    setLocation(undefined)
    setNearby(false)
    setSelected(null)
  }

  function showOnMap(id: string) {
    setSelected(id)
    mapSection.current?.scrollIntoView({ block: 'start' })
  }

  const externalSearch = 'https://www.google.com/maps/search/?' + new URLSearchParams({
    api: '1', query: 'Seva Sindhu service centres, ' + (query || 'Karnataka, India'),
  })

  return <div className="page-stack">
    <PageHeader title="Seva Sindhu Centres" description="Find government-listed service centres and plan your visit." icon={<MapPin size={22} />} />
    <section className="card panel section-stack" aria-label="Centre search controls">
      <form className="locator-search" onSubmit={search}>
        <label>PIN code, city or district<input name="location" type="search" maxLength={100} value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="For example, Dharwad or 580001" /></label>
        <button className="button button-primary"><Search size={17} aria-hidden="true" /> Search centres</button>
      </form>
      <div className="locator-filters">
        <label>Centre type<select value={type} onChange={event => { setType(event.target.value as CentreType | ''); setVisibleCount(12) }}>
          <option value="">All centre types</option>{centreTypes.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Search radius<select value={radius} onChange={event => { setRadius(Number(event.target.value) as Radius); setVisibleCount(12); if (position) setNearby(true) }}>
          {radii.map(value => <option key={value} value={value}>{value} km</option>)}
        </select></label>
        <label>Sort by<select value={sort} onChange={event => setSort(event.target.value as SortOrder)}>
          <option value="distance">Distance when available</option><option value="name">Centre name</option>
        </select></label>
        <label>Directions mode<select value={travelMode} onChange={event => setTravelMode(event.target.value as TravelMode)}>
          <option value="driving">Driving</option><option value="walking">Walking</option>
        </select></label>
      </div>
      <div className="button-row">
        <button type="button" className="button button-outline" disabled={locating} onClick={() => void requestLocation()}>
          <LocateFixed size={17} aria-hidden="true" /> {locating ? 'Finding your location…' : 'Use My Location'}
        </button>
        <button type="button" className="button button-outline" aria-pressed={nearby} disabled={locating} onClick={() => {
          if (position) {
            if (!nearby) { setQuery(''); setSearchText(''); setVisibleCount(12) }
            setNearby(value => !value)
          } else void requestLocation()
        }}>Near Me</button>
        {(position || locating) && <button type="button" className="button button-outline" onClick={clearLocation}>
          <X size={15} aria-hidden="true" /> {locating ? 'Cancel location request' : 'Clear location'}
        </button>}
      </div>
      <p className="metadata">Your location stays in this page while you use it. Map providers receive requests for the area shown. Opening Directions shares your origin with Google Maps.</p>
      {locating && <p role="status">Waiting for your browser to find your location.</p>}
      {locationIssue && <Notice><span role="alert">{locationIssue}</span>{' '}<button type="button" className="text-link" onClick={() => void requestLocation()}>Retry location</button></Notice>}
      {position && <p role="status">Location found · estimated accuracy ±{Math.max(1, Math.round(position.accuracy))} m.</p>}
    </section>
    <section className="card panel section-stack locator-map-panel" ref={mapSection} aria-label="Centre map and selected centre">
      <div className="section-heading">
        <h2>Service centre map</h2>
        <div className="button-row" role="group" aria-label="Map layer">
          <button type="button" className="button button-outline" aria-pressed={mode === 'roadmap'} onClick={() => setMode('roadmap')}>Map</button>
          <button type="button" className="button button-outline" aria-pressed={mode === 'satellite'} onClick={() => setMode('satellite')}>Satellite</button>
        </div>
      </div>
      {mode === 'satellite' && !satelliteKey && <Notice>Embedded satellite imagery requires a MapTiler key. You can keep using the road map below.</Notice>}
      <Suspense fallback={<Loading />}>
        <CentreMap items={result.items} position={position} mode={mode} satelliteKey={satelliteKey}
          selected={active?.id ?? null} onSelect={setSelected} />
      </Suspense>
      {active && <div className="locator-selected section-stack" aria-live="polite">
        <h3>{active.name}</h3><p>{active.address}</p>
        <a className="text-link" href={directionsUrl(active, travelMode, position)} target="_blank" rel="noreferrer">Directions to {active.name}</a>
      </div>}
      <div className="button-row">
        <a className="text-link" href={mapFallbackUrl(mode, active?.coordinates ?? position)} target="_blank" rel="noreferrer">
          Open {mode === 'satellite' ? 'satellite view' : 'map view'} in Google Maps
        </a>
        <a className="text-link" href={externalSearch} target="_blank" rel="noreferrer">Search this area on Google Maps</a>
        <a className="text-link" href={directory} target="_blank" rel="noreferrer">Official Seva Sindhu directory</a>
      </div>
    </section>
    <section className="card panel section-stack" aria-label="Service centre results">
      <h2>{nearby ? 'Nearby service centres' : 'Published centre listings'}</h2>
      {response.data && <p>{provenance[response.data.dataset]} {response.data.mapped_count} listings have coordinates for distance search. Confirm service availability before visiting.</p>}
      {response.loading && <Loading />}
      {response.error != null && <ConnectionError error={response.error} retry={response.retry} />}
      {response.data && <p role="status">{result.items.length} {result.items.length === 1 ? 'centre' : 'centres'}{nearby && position ? ' within ' + radius + ' km' : ''}{query && ' matching “' + query + '”'}</p>}
      {nearby && result.withoutCoordinates > 0 && <p className="metadata">{result.withoutCoordinates} matching {result.withoutCoordinates === 1 ? 'listing has' : 'listings have'} no reliable coordinates. Turn off Near Me to view {result.withoutCoordinates === 1 ? 'it' : 'them'}.</p>}
      {response.data && (result.items.length ? <div className="citizen-two">{result.items.slice(0, visibleCount).map(item => <article className="card panel section-stack locator-result" key={item.id} data-selected={active?.id === item.id}>
        <div className="section-heading"><h3>{item.name}</h3><StatusBadge tone="blue">{item.centre_type}</StatusBadge></div>
        <p>{item.address}</p>
        {item.phone && <p><a className="text-link" href={'tel:' + item.phone}>{item.phone}</a></p>}
        <p><strong>{item.distance === null ? 'Straight-line distance unavailable' : item.distance.toFixed(1) + ' km straight-line'}</strong>{item.distance !== null && ' · Route distance is available in Google Maps.'}</p>
        <p className="metadata">Listing checked <time dateTime={item.verified_on}>{item.verified_on}</time>
          {item.coordinates && <> · <a className="text-link" href={item.coordinates.source} target="_blank" rel="noreferrer">{item.coordinates.confidence === 'official_site' ? 'Published site coordinates' : 'Coordinates matched to the site'}</a></>}
        </p>
        <div className="button-row">
          <a className="button button-outline" href={directionsUrl(item, travelMode, position)} target="_blank" rel="noreferrer">Directions</a>
          {item.coordinates && <button type="button" className="button button-outline" aria-pressed={active?.id === item.id} onClick={() => showOnMap(item.id)}>Show on map</button>}
          <a className="text-link" href={item.source} target="_blank" rel="noreferrer">Official listing</a>
        </div>
      </article>)}</div> : <EmptyState title={nearby ? 'No mapped centres match this radius' : 'No published centres match your search'}
        action={nearby && radius < 50 ? <button className="button button-outline" type="button" onClick={() => setRadius(radii[radii.indexOf(radius) + 1])}>Increase search radius</button> : undefined}>
        {nearby ? 'Try a wider radius, change the centre type or use the official directory.' : 'Try a nearby PIN code, city or district, or choose all centre types.'}
      </EmptyState>)}
      {result.items.length > visibleCount && <button className="button button-outline" type="button" onClick={() => setVisibleCount(count => count + 12)}>Show more centres</button>}
    </section>
  </div>
}
