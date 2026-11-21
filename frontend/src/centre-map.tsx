import { useEffect, useRef, useState } from 'react'
import { circle, divIcon, featureGroup, latLngBounds, map, marker, tileLayer, type Map as LeafletMap, type Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { basemap, type CentreResult, type LocationFix, type MapMode } from './centre-locator'

const karnataka: [number, number] = [15.3173, 75.7139]
const roadAttribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const satelliteAttribution = '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> • © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const centreIcon = divIcon({ className: 'centre-marker', iconSize: [23, 23], iconAnchor: [11, 11] })
const locationIcon = divIcon({ className: 'centre-marker centre-marker-location', iconSize: [24, 24], iconAnchor: [12, 12] })

export default function CentreMap({ items, position, mode, satelliteKey, selected, onSelect }: {
  items: CentreResult[]
  position?: LocationFix
  mode: MapMode
  satelliteKey?: string
  selected: string | null
  onSelect: (id: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<LeafletMap>(null)
  const markers = useRef(new Map<string, Marker>())
  const [tileFailure, setTileFailure] = useState(false)
  const [reload, setReload] = useState(0)
  const { imagery, template } = basemap(mode, satelliteKey)

  useEffect(() => {
    if (!container.current) return
    const element = container.current
    const view = map(element, { scrollWheelZoom: false, maxZoom: 19 }).setView(karnataka, 7)
    instance.current = view
    const resize = new ResizeObserver(() => view.invalidateSize({ pan: false }))
    resize.observe(element)
    return () => {
      resize.disconnect()
      view.remove()
      instance.current = null
    }
  }, [])

  useEffect(() => {
    const view = instance.current
    if (!view) return
    setTileFailure(false)
    const tiles = tileLayer(template, {
      maxNativeZoom: imagery ? 20 : 19, maxZoom: 19,
      attribution: imagery ? satelliteAttribution : roadAttribution,
    }).on('tileerror', () => setTileFailure(true)).addTo(view)
    return () => { tiles.remove() }
  }, [imagery, template, reload])

  useEffect(() => {
    const view = instance.current
    if (!view) return
    const layer = featureGroup().addTo(view)
    const points: [number, number][] = []
    markers.current.clear()
    if (position) {
      const point: [number, number] = [position.latitude, position.longitude]
      points.push(point)
      circle(point, { radius: position.accuracy, color: '#14499a', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(layer)
      marker(point, { icon: locationIcon, title: 'Your location', keyboard: false, zIndexOffset: 1000 })
        .bindTooltip('Your location').addTo(layer)
    }
    for (const item of items) {
      if (!item.coordinates) continue
      const point: [number, number] = [item.coordinates.latitude, item.coordinates.longitude]
      points.push(point)
      const content = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = item.name
      content.append(name, document.createElement('br'), item.address)
      if (item.distance !== null) content.append(document.createElement('br'), item.distance.toFixed(1) + ' km straight-line')
      const pin = marker(point, { icon: centreIcon, title: item.name, alt: item.name })
        .bindPopup(content, { autoPan: false }).on('click', () => onSelect(item.id)).addTo(layer)
      pin.getElement()?.setAttribute('aria-label', 'Show ' + item.name)
      markers.current.set(item.id, pin)
    }
    if (points.length > 1) {
      view.fitBounds(latLngBounds(points), { padding: [30, 30], maxZoom: 16, animate: false })
    } else if (points.length === 1) view.setView(points[0], 15, { animate: false })
    else view.setView(karnataka, 7, { animate: false })
    return () => { layer.remove(); markers.current.clear() }
  }, [items, position, onSelect])

  useEffect(() => {
    const view = instance.current
    if (!view) return
    const pin = selected ? markers.current.get(selected) : undefined
    if (pin) {
      if (!view.getBounds().contains(pin.getLatLng())) view.panTo(pin.getLatLng(), { animate: false })
      pin.openPopup()
    } else view.closePopup()
  }, [selected, items, position])

  return <div className="section-stack">
    <div className="locator-map-frame">
      <div ref={container} className="locator-map" role="region" aria-label={imagery ? 'Satellite service centre map' : 'Road service centre map'} />
      {imagery && <a href="https://www.maptiler.com/" target="_blank" rel="noreferrer" className="locator-map-credit" aria-label="MapTiler">
        <img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler" />
      </a>}
    </div>
    {tileFailure && <p role="status">Some map tiles could not load. The centre list is still available. <button type="button" className="text-link" onClick={() => setReload(value => value + 1)}>Retry map tiles</button></p>}
  </div>
}
