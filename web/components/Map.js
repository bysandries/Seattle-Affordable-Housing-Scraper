'use client'

import { useEffect, useRef, useState } from 'react'

const SEATTLE_CENTER = [47.6062, -122.3321]
const MIXED_COLOR = '#f59e0b'
const AFFORDABLE_COLOR = '#7c3aed'

export default function Map({ properties, highlightId, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const [mapReady, setMapReady] = useState(false)

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
    if (!mapReady || !map || !properties?.length) return

    import('leaflet').then((L) => {
      // Remove old markers
      Object.values(markersRef.current).forEach((m) => m.remove())
      markersRef.current = {}

      properties.forEach((p) => {
        if (!p.lat || !p.long) return

        const isMixed = p.program === 'Mixed Market and Affordable'
        const hasListings = p.listing_count > 0

        const marker = L.circleMarker([p.lat, p.long], {
          radius: hasListings ? 9 : 6,
          fillColor: isMixed ? MIXED_COLOR : AFFORDABLE_COLOR,
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: hasListings ? 0.95 : 0.65,
        })

        marker.bindPopup(
          `<strong class="text-sm">${p.building_name}</strong><br/>
           <span class="text-slate-500">${p.address}</span><br/>
           <span class="text-xs mt-1 inline-block">${p.neighborhood}</span>
           ${hasListings ? '<br/><span class="text-green-600 font-medium text-xs">✓ Listings available</span>' : ''}`,
          { maxWidth: 220 }
        )

        marker.on('click', () => onSelect && onSelect(p.id))
        marker.addTo(map)
        markersRef.current[p.id] = marker
      })
    })
  }, [mapReady, properties, onSelect])

  // Highlight selected marker
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return

    import('leaflet').then((L) => {
      Object.entries(markersRef.current).forEach(([id, marker]) => {
        const isSelected = Number(id) === Number(highlightId)
        marker.setStyle({
          radius: isSelected ? 13 : marker.options.radius < 10 ? 9 : 6,
          color: isSelected ? '#1e40af' : '#fff',
          weight: isSelected ? 3 : 2,
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
  }, [mapReady, highlightId, properties])

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
        <div className="flex items-center gap-2 border-t pt-1 mt-1">
          <span className="inline-block w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white shadow" />
          Has live pricing
        </div>
      </div>
    </div>
  )
}
