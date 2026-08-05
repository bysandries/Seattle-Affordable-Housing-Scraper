'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FilterBar from '@/components/FilterBar'
import PropertyCard from '@/components/PropertyCard'
import PropertyModal from '@/components/PropertyModal'
import { bedroomAliases } from '@/lib/bedrooms'
import { useFavorites } from '@/lib/favorites'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

const DEFAULT_FILTERS = {
  search: '',
  neighborhood: '',
  city: '',
  program: '',
  incentive: '',
  bedroom: '',
  maxRent: 0,
  hasListings: false,
  availableNow: false,
  favoritesOnly: false,
  page: 1,
}

export default function HomePage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [properties, setProperties] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mapProperties, setMapProperties] = useState([])
  const [neighborhoods, setNeighborhoods] = useState([])
  const [cities, setCities] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const {
    propertyIds: favoritePropertyIds,
    isPropertyFavorite,
    toggleProperty,
    savedUnitCount,
    count: favoriteCount,
  } = useFavorites()
  const [modalId, setModalId] = useState(null)
  const [view, setView] = useState('split') // 'split' | 'list' | 'map'
  const listRef = useRef(null)
  const abortRef = useRef(null)

  // Load static data once
  useEffect(() => {
    fetch('/api/properties?type=map')
      .then((r) => r.json())
      .then(setMapProperties)
    fetch('/api/properties?type=neighborhoods')
      .then((r) => r.json())
      .then(setNeighborhoods)
    fetch('/api/properties?type=cities')
      .then((r) => r.json())
      .then(setCities)
  }, [])

  // Load filtered properties
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    const params = new URLSearchParams(
      Object.entries(filters)
        .filter(([k, v]) => k !== 'favoritesOnly' && v !== '' && v !== 0 && v !== false)
        .map(([k, v]) => [k, String(v)])
    )
    // Sent even when empty, so "no favorites yet" returns nothing rather than
    // silently falling back to every property.
    if (filters.favoritesOnly) params.set('ids', favoritePropertyIds.join(','))

    fetch(`/api/properties?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(({ properties, total }) => {
        setProperties(properties)
        setTotal(total)
        setLoading(false)
        if (listRef.current) listRef.current.scrollTop = 0
      })
      .catch((e) => { if (e.name !== 'AbortError') setLoading(false) })
    // Joined rather than passed by reference: unhearting while the favorites
    // filter is on must refetch, but toggling otherwise should not.
  }, [filters, filters.favoritesOnly ? favoritePropertyIds.join(',') : ''])

  const handleCardClick = useCallback((id) => {
    setSelectedId(id)
    setModalId(id)
  }, [])

  const handleMapSelect = useCallback((id) => {
    setSelectedId(id)
    setModalId(id)
  }, [])

  const handleFilterChange = useCallback((next) => {
    setFilters(next)
  }, [])

  const clearFilters = () => setFilters(DEFAULT_FILTERS)

  // Mirror the list query's filter semantics (lib/db.js getProperties) so the
  // map always shows the same set of properties as the list.
  const visibleMapProperties = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return mapProperties.filter((p) => {
      if (filters.favoritesOnly && !favoritePropertyIds.includes(Number(p.id))) return false
      if (filters.hasListings && !(p.listing_count > 0)) return false
      if (filters.availableNow && !(p.available_now_count > 0)) return false
      if (filters.neighborhood && p.neighborhood !== filters.neighborhood) return false
      if (filters.city && p.city !== filters.city) return false
      if (filters.program && p.program !== filters.program) return false
      if (filters.incentive) {
        const inAny = p.has_mfte || p.has_iz || p.has_mha
        if (filters.incentive === 'none' ? inAny : !p[`has_${filters.incentive}`])
          return false
      }
      if (filters.bedroom) {
        // Mirrors BEDROOM_ALIASES in lib/db.js — the Seattle layer spells these
        // "1-Bedroom" while scraped statewide rows use "1br".
        const types = (p.br_types || '').toLowerCase()
        if (!bedroomAliases(filters.bedroom).some((a) => types.includes(a))) return false
      }
      if (filters.maxRent > 0 && p.min_rent != null && p.min_rent > filters.maxRent)
        return false
      if (
        q &&
        ![p.building_name, p.address, p.neighborhood, p.city].some((s) =>
          (s || '').toLowerCase().includes(q)
        )
      )
        return false
      return true
    })
  }, [mapProperties, filters, favoritePropertyIds])

  const hasActiveFilters = Object.entries(filters).some(
    ([k, v]) => k !== 'page' && v !== DEFAULT_FILTERS[k]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">🏙</span>
          <div>
            <h1 className="font-bold text-slate-900 text-base leading-tight">
              Seattle Affordable Housing
            </h1>
            <p className="text-xs text-slate-400 leading-tight">
              {mapProperties.length} properties · Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* View toggle — desktop */}
        <div className="ml-auto hidden md:flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {[
            { id: 'list', icon: '☰', label: 'List' },
            { id: 'split', icon: '⊞', label: 'Split' },
            { id: 'map', icon: '🗺', label: 'Map' },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                view === v.id ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {v.icon} {v.label}
            </button>
          ))}
        </div>

        {/* View toggle — mobile */}
        <div className="ml-auto md:hidden flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setView(view === 'map' ? 'list' : 'map')}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-white shadow text-slate-900"
          >
            {view === 'map' ? '☰ List' : '🗺 Map'}
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        neighborhoods={neighborhoods}
        cities={cities}
        favoriteCount={favoriteCount}
        total={total}
        onChange={handleFilterChange}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Property list panel */}
        {view !== 'map' && (
          <div
            className={`flex flex-col overflow-hidden bg-slate-50 ${
              view === 'split' ? 'w-full md:w-[52%] md:border-r md:border-slate-200' : 'w-full'
            }`}
          >
            {/* List header */}
            <div className="px-4 py-2 flex items-center justify-between shrink-0 border-b border-slate-100 bg-white">
              <span className="text-xs text-slate-500">
                {loading
                  ? 'Loading…'
                  : total === 0
                  ? 'No results'
                  : `${total.toLocaleString()} propert${total !== 1 ? 'ies' : 'y'}`}
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Cards */}
            <div ref={listRef} className="overflow-y-auto flex-1 p-3 scrollbar-thin">
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-white rounded-xl border-2 border-slate-100 h-32 animate-pulse"
                    />
                  ))}
                </div>
              ) : properties.length === 0 ? (
                <div className="text-center text-slate-400 py-16">
                  <div className="text-4xl mb-3">🏘</div>
                  <p className="text-sm">No properties match your filters.</p>
                  <button onClick={clearFilters} className="mt-3 text-blue-600 text-sm hover:underline">
                    Clear all filters
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {properties.map((p) => (
                      <PropertyCard
                        key={p.id}
                        property={p}
                        isSelected={selectedId === p.id}
                        onClick={() => handleCardClick(p.id)}
                        isFavorite={isPropertyFavorite(p.id)}
                        onToggleFavorite={() => toggleProperty(p.id)}
                        savedUnitCount={savedUnitCount(p.id)}
                      />
                    ))}
                  </div>

                  {/* Pagination */}
                  {total > 48 && (
                    <div className="flex items-center justify-center gap-3 mt-6 pb-4">
                      <button
                        disabled={filters.page <= 1}
                        onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                        className="text-sm px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ← Prev
                      </button>
                      <span className="text-sm text-slate-500">
                        Page {filters.page} of {Math.ceil(total / 48)}
                      </span>
                      <button
                        disabled={filters.page >= Math.ceil(total / 48)}
                        onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                        className="text-sm px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Footer Links */}
              {!loading && (
                <div className="mt-8 mb-4 border-t border-slate-200 pt-6 pb-2 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-slate-500">
                  <a href="/about" className="hover:text-blue-600 transition-colors">About</a>
                  <a href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</a>
                  <a href="/terms" className="hover:text-blue-600 transition-colors">Terms of Service</a>
                  <a href="/disclaimer" className="hover:text-blue-600 transition-colors">Legal Disclaimer</a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Map panel */}
        {view !== 'list' && (
          <div
            className={`relative ${
              view === 'split' ? 'hidden md:block md:flex-1' : 'flex-1'
            }`}
          >
            <Map
              properties={visibleMapProperties}
              highlightId={selectedId}
              onSelect={handleMapSelect}
              fitTo={filters.city}
            />
          </div>
        )}
      </div>

      {/* Property modal */}
      {modalId && (
        <PropertyModal
          propertyId={modalId}
          onClose={() => {
            setModalId(null)
            setSelectedId(null)
          }}
        />
      )}
    </div>
  )
}
