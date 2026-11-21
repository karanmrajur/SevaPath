import type { Centre, CentreType } from './citizen-api'

export type Point = { latitude: number; longitude: number }
export type LocationFix = Point & { accuracy: number }
export type MapMode = 'roadmap' | 'satellite'
export type TravelMode = 'driving' | 'walking'
export type SortOrder = 'distance' | 'name'
export const radii = [5, 10, 25, 50] as const
export type Radius = typeof radii[number]

export type LocationResult =
  | { state: 'found'; point: LocationFix }
  | { state: 'denied' | 'timeout' | 'unavailable' | 'unsupported' }

export function locateDevice(geolocation?: Pick<Geolocation, 'getCurrentPosition'>): Promise<LocationResult> {
  if (!geolocation) return Promise.resolve({ state: 'unsupported' })
  return new Promise(resolve => {
    try {
      geolocation.getCurrentPosition(({ coords }) => {
        const { latitude, longitude, accuracy } = coords
        if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90
            || Math.abs(longitude) > 180 || accuracy < 0) {
          resolve({ state: 'unavailable' })
          return
        }
        resolve({ state: 'found', point: { latitude, longitude, accuracy } })
      }, ({ code }) => resolve({ state: code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable' }),
      { timeout: 12_000, maximumAge: 0, enableHighAccuracy: true })
    } catch {
      resolve({ state: 'unavailable' })
    }
  })
}

export function distanceKm(from: Point, to: Point) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const central = Math.sin(radians(to.latitude - from.latitude) / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(radians(to.longitude - from.longitude) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, central)))
}

export type CentreResult = Centre & { distance: number | null }

export function findCentres(centres: Centre[], filters: {
  query: string
  type: CentreType | ''
  origin?: Point
  radius?: Radius
  sort: SortOrder
}): { items: CentreResult[]; withoutCoordinates: number } {
  const normalize = (text: string) => text.trim().normalize('NFKC').toLowerCase()
  const query = normalize(filters.query)
  const terms = query.split(/[\s,]+/u).filter(Boolean)
  const items: CentreResult[] = []
  let withoutCoordinates = 0
  for (const centre of centres) {
    if (filters.type && centre.centre_type !== filters.type) continue
    const haystack = normalize([centre.name, centre.address, centre.city, centre.district, centre.pin, ...centre.aliases].join(' '))
    if (/^\d{6}$/u.test(query) ? centre.pin !== query : !terms.every(term => haystack.includes(term))) continue
    const distance = filters.origin && centre.coordinates ? distanceKm(filters.origin, centre.coordinates) : null
    if (distance === null && centre.coordinates === null) withoutCoordinates++
    if (filters.origin && filters.radius && (distance === null || distance > filters.radius)) continue
    items.push({ ...centre, distance })
  }
  items.sort((first, second) => {
    if (filters.sort === 'distance' && first.distance !== second.distance) {
      if (first.distance === null) return 1
      if (second.distance === null) return -1
      return first.distance - second.distance
    }
    return first.name.localeCompare(second.name, 'en-IN')
  })
  return { items, withoutCoordinates }
}

export function directionsUrl(centre: Centre, mode: TravelMode, origin?: Point) {
  const destination = centre.coordinates?.confidence === 'official_site'
    ? centre.coordinates.latitude + ',' + centre.coordinates.longitude
    : centre.address
  const params = new URLSearchParams({ api: '1', destination, travelmode: mode, dir_action: 'navigate' })
  if (origin) params.set('origin', origin.latitude + ',' + origin.longitude)
  return 'https://www.google.com/maps/dir/?' + params
}

export function basemap(mode: MapMode, satelliteKey?: string) {
  const imagery = mode === 'satellite' && !!satelliteKey
  const template = imagery
    ? 'https://api.maptiler.com/tiles/satellite-v4/{z}/{x}/{y}?key=' + encodeURIComponent(satelliteKey)
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  return { imagery, template }
}

export function mapFallbackUrl(mode: MapMode, point?: Point) {
  return 'https://www.google.com/maps/@?' + new URLSearchParams({
    api: '1', map_action: 'map', basemap: mode, zoom: point ? '13' : '7',
    center: point ? point.latitude.toFixed(3) + ',' + point.longitude.toFixed(3) : '15.3173,75.7139',
  })
}
