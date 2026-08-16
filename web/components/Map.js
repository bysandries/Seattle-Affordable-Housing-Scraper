'use client'

import { useEffect, useRef, useState } from 'react'

const SEATTLE_CENTER = [47.6062, -122.3321]
// Google-palette marker colors, mirrored by the filter chips and legend.
const MIXED_COLOR = '#f9ab00'
const AFFORDABLE_COLOR = '#188038'
const MARKET_COLOR = '#1a73e8'

const PROGRAM_COLOR = {
  'Mixed Market and Affordable': MIXED_COLOR,
  'Fully Affordable': AFFORDABLE_COLOR,
  'Market Rate': MARKET_COLOR,
}

const SAVED_RING = '#d93025'

export default function Map({ properties, highlightId, onSelect, fitTo, savedIds, savedUnitCountFor }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const propsRef = useRef(properties)
  const [mapReady, setMapReady] = useState(false)
  // Phones: the legend would cover a third of the map, so it starts collapsed
  // behind a toggle chip there. Desktop always shows it.
  const [legendOpen, setLegendOpen] = useState(false)

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

    // The container changes size without a window resize when the panel
    // reshapes between the "Rent" card and the full-bleed "Maps" view;
    // Leaflet only listens for window resizes, so re-measure explicitly.
    const observer = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.invalidateSize()
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
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
      // Diff against the markers already on the map instead of recreating all
      // of them: with ~2,800 properties a full teardown per filter change
      // blocks the main thread long enough to freeze the tab.
      const seen = new Set()

      properties.forEach((p) => {
        if (!p.lat || !p.long) return
        seen.add(String(p.id))

        const hasListings = p.listing_count > 0
        // A building counts as saved whether it was hearted itself or holds a
        // saved apartment — either way the whole building is marked, so a saved
        // unit is findable on the map.
        const saved = !!savedIds && savedIds.has(Number(p.id))
        const savedUnits = savedUnitCountFor ? savedUnitCountFor(p.id) : 0

        const radius = saved ? (hasListings ? 11 : 9) : hasListings ? 9 : 6
        const style = {
          fillColor: PROGRAM_COLOR[p.program] ?? AFFORDABLE_COLOR,
          color: saved ? SAVED_RING : '#fff',
          weight: saved ? 4 : 2,
          opacity: 1,
          fillOpacity: hasListings ? 0.95 : 0.65,
        }
        // Inline styles with inherited colors so popups read correctly on both
        // the light and dark popup surfaces.
        const popup =
          `<strong class="text-sm">${p.building_name}</strong><br/>
           <span style="opacity:.65">${p.address}</span><br/>
           <span class="text-xs mt-1 inline-block" style="opacity:.8">${p.neighborhood}</span>
           ${saved ? `<br/><span class="text-xs font-medium" style="color:#f28b82">♥ Saved${savedUnits ? ` · ${savedUnits} apartment${savedUnits !== 1 ? 's' : ''}` : ''}</span>` : ''}
           ${hasListings ? '<br/><span class="font-medium text-xs" style="color:#34a853">✓ Listings available</span>' : ''}`

        const existing = markersRef.current[p.id]
        if (existing) {
          existing.setStyle(style)
          // Radius is not a Path style; setStyle silently ignores it.
          existing.setRadius(radius)
          existing.setPopupContent(popup)
          return
        }

        const marker = L.circleMarker([p.lat, p.long], { radius, ...style })
        marker.bindPopup(popup, { maxWidth: 220 })
        marker.on('click', () => onSelect && onSelect(p.id))
        marker.addTo(map)
        markersRef.current[p.id] = marker
      })

      Object.keys(markersRef.current).forEach((id) => {
        if (!seen.has(String(id))) {
          markersRef.current[id].remove()
          delete markersRef.current[id]
        }
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
          color: isSelected ? '#174ea6' : saved ? SAVED_RING : '#fff',
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
      <div className="absolute bottom-8 left-3 z-[1000] flex flex-col items-start gap-1.5">
      <div className={`${legendOpen ? 'block' : 'hidden'} sm:block bg-white dark:bg-gsurface-dark-raised text-gink-secondary dark:text-gink-dark-secondary rounded-xl shadow-lg border border-gline dark:border-gline-dark px-3 py-2 text-xs space-y-1`}>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: MIXED_COLOR }} />
          Mixed Market
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: AFFORDABLE_COLOR }} />
          Fully Affordable
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: MARKET_COLOR }} />
          Market Rate
        </div>
        <div className="flex items-center gap-2 border-t border-gline dark:border-gline-dark pt-1 mt-1">
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ background: MIXED_COLOR }} />
          Has live pricing
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3.5 h-3.5 rounded-full bg-gsurface-chip shadow"
            style={{ border: `3px solid ${SAVED_RING}` }}
          />
          Saved
        </div>
      </div>
      <button
        type="button"
        onClick={() => setLegendOpen((o) => !o)}
        aria-expanded={legendOpen}
        className="sm:hidden flex items-center gap-1.5 h-8 px-3 rounded-full bg-white dark:bg-gsurface-dark-raised border border-gline dark:border-gline-dark text-xs text-gink-secondary dark:text-gink-dark-secondary shadow-lg"
      >
        <span className="flex gap-0.5" aria-hidden="true">
          <span className="w-2 h-2 rounded-full" style={{ background: MIXED_COLOR }} />
          <span className="w-2 h-2 rounded-full" style={{ background: AFFORDABLE_COLOR }} />
          <span className="w-2 h-2 rounded-full" style={{ background: MARKET_COLOR }} />
        </span>
        {legendOpen ? 'Hide legend' : 'Legend'}
      </button>
      </div>
    </div>
  )
}
