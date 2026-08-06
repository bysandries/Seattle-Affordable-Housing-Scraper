'use client'

import { useEffect, useRef, useState } from 'react'

const SEATTLE_CENTER = [47.6062, -122.3321]
const MIXED_COLOR = '#f59e0b'
const AFFORDABLE_COLOR = '#7c3aed'
const MARKET_COLOR = '#0284c7'

const PROGRAM_COLOR = {
  'Mixed Market and Affordable': MIXED_COLOR,
  'Fully Affordable': AFFORDABLE_COLOR,
  'Market Rate': MARKET_COLOR,
}

const SAVED_RING = '#e11d48'

export default function Map({ properties, highlightId, onSelect, fitTo, savedIds, savedUnitCountFor }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const propsRef = useRef(properties)
  const [mapReady, setMapReady] = useState(false)

  propsRef.current = properties

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return

    import('leaflet').then((L) => {
      if (mapRef.current) return

      const map = L.map(containerRef.current, { zoomControl: false }).setView(SEATTLE_CENTER, 12)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      mapRef.current = map
      setMapReady(true)
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markersRef.current = {}
      }
    }
  }, [])

  // Render markers once map is ready and properties are available
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !properties) return

    import('leaflet').then((L) => {
      // Remove old markers
      Object.values(markersRef.current).forEach((m) => m.remove())
      markersRef.current = {}

      properties.forEach((p) => {
        if (!p.lat || !p.long) return

        const hasListings = p.listing_count > 0
        // A building counts as saved whether it was hearted itself or holds a
        // saved apartment — either way the whole building is marked, so a saved
        // unit is findable on the map.
        const saved = !!savedIds && savedIds.has(Number(p.id))
        const savedUnits = savedUnitCountFor ? savedUnitCountFor(p.id) : 0

        const marker = L.circleMarker([p.lat, p.long], {
          radius: saved ? (hasListings ? 11 : 9) : hasListings ? 9 : 6,
          fillColor: PROGRAM_COLOR[p.program] ?? AFFORDABLE_COLOR,
          color: saved ? SAVED_RING : '#fff',
          weight: saved ? 4 : 2,
          opacity: 1,
          fillOpacity: hasListings ? 0.95 : 0.65,
        })

        marker.bindPopup(
          `<strong class="text-sm">${p.building_name}</strong><br/>
           <span class="text-slate-500">${p.address}</span><br/>
           <span class="text-xs mt-1 inline-block">${p.neighborhood}</span>
           ${saved ? `<br/><span class="text-xs font-medium" style="color:${SAVED_RING}">♥ Saved${savedUnits ? ` · ${savedUnits} apartment${savedUnits !== 1 ? 's' : ''}` : ''}</span>` : ''}
           ${hasListings ? '<br/><span class="text-green-600 font-medium text-xs">✓ Listings available</span>' : ''}`,
          { maxWidth: 220 }
        )

        marker.on('click', () => onSelect && onSelect(p.id))
        marker.addTo(map)
        markersRef.current[p.id] = marker
      })
    })
  }, [mapReady, properties, onSelect, savedIds, savedUnitCountFor])

  // Recentre when the city filter changes — the map opens on Seattle, so
  // selecting another city would otherwise leave the viewport somewhere empty.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !fitTo) return
    const pts = (propsRef.current || []).filter((p) => p.lat && p.long).map((p) => [p.lat, p.long])
    if (!pts.length) return
    import('leaflet').then((L) => {
      map.fitBounds(L.latLngBounds(pts).pad(0.15), { animate: true, maxZoom: 15 })
    })
  }, [mapReady, fitTo])

  // Highlight selected marker
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return

    import('leaflet').then((L) => {
      Object.entries(markersRef.current).forEach(([id, marker]) => {
        const isSelected = Number(id) === Number(highlightId)
        // Restore the saved ring rather than resetting every marker to white,
        // which previously erased the highlight as soon as anything was clicked.
        const saved = !!savedIds && savedIds.has(Number(id))
        marker.setStyle({
          radius: isSelected ? 13 : marker.options.radius,
          color: isSelected ? '#1e40af' : saved ? SAVED_RING : '#fff',
          weight: isSelected ? 3 : saved ? 4 : 2,
          fillOpacity: isSelected ? 1 : marker.options.fillOpacity,
        })
        if (isSelected) {
          const p = properties?.find((x) => x.id === Number(highlightId))
          if (p?.lat && p?.long) {
            map.setView([p.lat, p.long], Math.max(map.getZoom(), 15), { animate: true })
          }
          marker.openPopup()
        }
      })
    })
  }, [mapReady, highlightId, properties, savedIds])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {/* Legend */}
      <div className="absolute bottom-8 left-3 z-[1000] bg-white rounded-lg shadow px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-400 border-2 border-white shadow" />
          Mixed Market
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-violet-600 border-2 border-white shadow" />
          Fully Affordable
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-sky-600 border-2 border-white shadow" />
          Market Rate
        </div>
        <div className="flex items-center gap-2 border-t pt-1 mt-1">
          <span className="inline-block w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white shadow" />
          Has live pricing
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3.5 h-3.5 rounded-full bg-slate-300 shadow"
            style={{ border: '3px solid #e11d48' }}
          />
          Saved
        </div>
      </div>
    </div>
  )
}
