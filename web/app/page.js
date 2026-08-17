'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FilterBar from '@/components/FilterBar'
import PropertyCard from '@/components/PropertyCard'
import PropertyPanel from '@/components/PropertyPanel'
import SearchHeader from '@/components/SearchHeader'
import { bedroomAliases } from '@/lib/bedrooms'
import { detectPlace, matchesTokens, tokenizeQuery } from '@/lib/searchQuery'
import { trackEvent } from '@/lib/analytics'
import {
  clearShareToken,
  decodeShare,
  importShared,
  readShareToken,
  resolveShared,
  useFavorites,
} from '@/lib/favorites'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

const PAGE_SIZE = 48

const DEFAULT_FILTERS = {
  search: '',
  neighborhood: '',
  city: '',
  county: '',
  program: '',
  incentive: '',
  bedroom: '',
  maxRent: 0,
  hasListings: false,
  availableNow: false,
  favoritesOnly: false,
  page: 1,
}

// The classic "Goooooogle" pager: one red-or-yellow "o" per reachable page,
// numbers beneath, Previous/Next on the ends.
function GooglePager({ page, pageCount, onPage }) {
  const start = Math.max(1, Math.min(page - 4, pageCount - 9))
  const end = Math.min(pageCount, start + 9)
  const pages = []
  for (let p = start; p <= end; p++) pages.push(p)

  const letter = 'font-display text-[27px] leading-none'

  return (
    <nav
      className="flex items-start justify-center mt-9 select-none max-w-full overflow-x-auto no-scrollbar"
      aria-label="Result pages"
    >
      {page > 1 && (
        <button
          onClick={() => onPage(page - 1)}
          className="mr-4 mt-[26px] text-sm text-google-blue-ink dark:text-google-link-dark hover:underline"
        >
          ‹ Previous
        </button>
      )}
      <span className="flex flex-col items-center px-px">
        <span className={`${letter} text-google-blue`}>G</span>
      </span>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => p !== page && onPage(p)}
          aria-current={p === page ? 'page' : undefined}
          className="flex flex-col items-center px-px group"
        >
          <span className={`${letter} ${p === page ? 'text-google-red' : 'text-google-yellow'}`}>o</span>
          <span
            className={`text-sm mt-1 ${
              p === page
                ? 'text-gink dark:text-gink-dark font-medium'
                : 'text-google-blue-ink dark:text-google-link-dark group-hover:underline'
            }`}
          >
            {p}
          </span>
        </button>
      ))}
      <span className="flex flex-col items-center px-px">
        <span className={`${letter} text-google-blue`}>g</span>
      </span>
      <span className="flex flex-col items-center px-px">
        <span className={`${letter} text-google-green`}>l</span>
      </span>
      <span className="flex flex-col items-center px-px">
        <span className={`${letter} text-google-red`}>e</span>
      </span>
      {page < pageCount && (
        <button
          onClick={() => onPage(page + 1)}
          className="ml-4 mt-[26px] text-sm text-google-blue-ink dark:text-google-link-dark hover:underline"
        >
          Next ›
        </button>
      )}
    </nav>
  )
}

// Google verticals embedded live: igu=1 serves the frame-embeddable variant of
// google.com results, and each tab maps onto its vertical's URL parameter.
// udm codes, not the legacy tbm= params — those redirect to pages that refuse
// framing, while the udm verticals render under igu=1.
const FRAME_TABS = {
  all: { label: 'All', param: '' },
  images: { label: 'Images', param: '&udm=2' },
  news: { label: 'News', param: '&tbm=nws' },
  shopping: { label: 'Shopping', param: '&udm=28' },
}

function GoogleFrame({ tab, search }) {
  const q = search.trim() || 'apartments for rent in Washington State'
  const query = `q=${encodeURIComponent(q)}${FRAME_TABS[tab].param}`
  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 sm:px-6 lg:pl-[172px] py-2 text-xs text-gink-tertiary dark:text-gink-dark-tertiary border-b border-gline dark:border-gline-dark shrink-0">
        <span>
          Live google.com {FRAME_TABS[tab].label} results for “{q}” — embedded as part of this
          concept.
        </span>
        <a
          href={`https://www.google.com/search?${query}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-google-blue-ink dark:text-google-link-dark hover:underline"
        >
          Open on Google ↗
        </a>
      </div>
      <iframe
        key={query}
        src={`https://www.google.com/search?igu=1&${query}`}
        title={`Google ${FRAME_TABS[tab].label} results`}
        referrerPolicy="no-referrer"
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  )
}

function ResultSkeleton() {
  return (
    <div className="space-y-9 mt-4" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="w-[26px] h-[26px] rounded-full bg-gsurface-chip dark:bg-gsurface-dark-chip" />
            <div className="h-3 w-44 rounded bg-gsurface-chip dark:bg-gsurface-dark-chip" />
          </div>
          <div className="h-5 w-3/4 rounded bg-gsurface-chip dark:bg-gsurface-dark-chip" />
          <div className="h-3 w-full rounded bg-gsurface-chip dark:bg-gsurface-dark-chip" />
          <div className="h-3 w-2/3 rounded bg-gsurface-chip dark:bg-gsurface-dark-chip" />
        </div>
      ))}
    </div>
  )
}

export default function HomePage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [properties, setProperties] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [elapsed, setElapsed] = useState(null) // query time for the stats line
  const [mapProperties, setMapProperties] = useState([])
  const [neighborhoods, setNeighborhoods] = useState([])
  const [cities, setCities] = useState([])
  const [counties, setCounties] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const {
    properties: favoriteProperties,
    units: favoriteUnits,
    places: favoritePlaces,
    propertyIds: favoritePropertyIds,
    isPropertyFavorite,
    toggleProperty,
    savedUnitCount,
    count: favoriteCount,
  } = useFavorites()
  // A list opened from a shared link. Held separately from this browser's own
  // favorites so arriving on a link never quietly rewrites what someone saved.
  const [shared, setShared] = useState(null)
  const [modalId, setModalId] = useState(null)
  // 'listings' (results + map panel) | 'map' (Maps tab) | a FRAME_TABS key
  // (All / Images / News / Shopping — live google.com embeds)
  const [view, setView] = useState('listings')
  const [toolsOpen, setToolsOpen] = useState(false)
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
    fetch('/api/properties?type=counties')
      .then((r) => r.json())
      .then(setCounties)
  }, [])

  // A shared link decodes into a view of someone else's list, shown until it is
  // either imported or dismissed. The token is stripped from the address bar so
  // a later reload does not resurrect it.
  useEffect(() => {
    const token = readShareToken()
    if (!token) return
    let cancelled = false
    decodeShare(token)
      // Re-point the list at current ids before showing it, so a building whose
      // id was reissued still appears instead of reading as "no longer listed".
      .then((list) => (list ? resolveShared(list) : null))
      .then((list) => {
        if (cancelled || !list || (!list.properties.length && !list.units.length)) return
        setShared(list)
        setFilters((f) => ({ ...f, favoritesOnly: true, page: 1 }))
        clearShareToken()
      })
    return () => { cancelled = true }
  }, [])

  // While viewing a shared list, "favorites" means theirs, not this browser's.
  // Declared before the effects that read it, or the dependency array evaluates
  // it in the temporal dead zone.
  const activeFavoriteIds = useMemo(() => {
    if (!shared) return favoritePropertyIds
    return [...new Set([...shared.properties, ...shared.units.map((u) => u.propertyId)])]
  }, [shared, favoritePropertyIds])

  // Buildings to mark on the map: hearted outright, or holding a saved
  // apartment. Shown while browsing, not only under the favorites filter.
  const savedIds = useMemo(() => new Set(activeFavoriteIds.map(Number)), [activeFavoriteIds])

  const sharedSavedUnitCount = useCallback(
    (id) =>
      shared
        ? shared.units.filter((u) => Number(u.propertyId) === Number(id)).length
        : savedUnitCount(id),
    [shared, savedUnitCount]
  )

  const sharedUnitKeys = useMemo(
    () => (shared ? new Set(shared.units.map((u) => u.key)) : null),
    [shared]
  )

  // Load filtered properties
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    const started = performance.now()
    const params = new URLSearchParams(
      Object.entries(filters)
        .filter(([k, v]) => k !== 'favoritesOnly' && v !== '' && v !== 0 && v !== false)
        .map(([k, v]) => [k, String(v)])
    )
    // Sent even when empty, so "no favorites yet" returns nothing rather than
    // silently falling back to every property.
    if (filters.favoritesOnly) params.set('ids', activeFavoriteIds.join(','))

    fetch(`/api/properties?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(({ properties, total }) => {
        setProperties(properties)
        setTotal(total)
        setElapsed(((performance.now() - started) / 1000).toFixed(2))
        setLoading(false)
        if (listRef.current) listRef.current.scrollTop = 0
      })
      .catch((e) => { if (e.name !== 'AbortError') setLoading(false) })
    // Joined rather than passed by reference: unhearting while the favorites
    // filter is on must refetch, but toggling otherwise should not.
  }, [filters, filters.favoritesOnly ? activeFavoriteIds.join(',') : ''])

  const handleCardClick = useCallback((id) => {
    setSelectedId(id)
    setModalId(id)
    trackEvent('property_opened', { source: 'list' })
  }, [])

  const handleMapSelect = useCallback((id) => {
    setSelectedId(id)
    setModalId(id)
    trackEvent('property_opened', { source: 'map' })
  }, [])

  const handleFilterChange = useCallback((next) => {
    setFilters(next)
  }, [])

  const handleSearch = useCallback((value) => {
    setFilters((f) => ({ ...f, search: value, page: 1 }))
  }, [])

  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), [])

  const acceptShared = () => {
    importShared(shared)
    setShared(null)
  }

  const dismissShared = () => {
    setShared(null)
    setFilters((f) => ({ ...f, favoritesOnly: false, page: 1 }))
  }

  // Mirror the list query's filter semantics (lib/db.js getProperties) so the
  // map always shows the same set of properties as the list.
  const visibleMapProperties = useMemo(() => {
    const tokens = tokenizeQuery(filters.search)
    return mapProperties.filter((p) => {
      if (filters.favoritesOnly && !activeFavoriteIds.includes(Number(p.id))) return false
      if (filters.hasListings && !(p.listing_count > 0)) return false
      if (filters.availableNow && !(p.available_now_count > 0)) return false
      if (filters.neighborhood && p.neighborhood !== filters.neighborhood) return false
      if (filters.city && p.city !== filters.city) return false
      if (filters.county && p.county !== filters.county) return false
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
        tokens.length &&
        !matchesTokens(tokens, [p.building_name, p.address, p.neighborhood, p.city, p.county])
      )
        return false
      return true
    })
  }, [mapProperties, filters, activeFavoriteIds])

  // The place a search names ("rent in lynnwood" → Lynnwood), so the map can
  // fly there even though no explicit location filter is set. Cities take
  // priority over neighborhoods over counties.
  const searchPlace = useMemo(() => {
    const tokens = tokenizeQuery(filters.search)
    if (!tokens.length) return ''
    return detectPlace(tokens, [...cities, ...neighborhoods, ...counties])
  }, [filters.search, cities, neighborhoods, counties])

  // One search event per settled query (not per keystroke), carrying only
  // derived signals — never the text the visitor typed.
  useEffect(() => {
    const tokens = tokenizeQuery(filters.search)
    if (!tokens.length) return
    const t = setTimeout(
      () => trackEvent('search', { place_matched: !!searchPlace, keywords: tokens.length }),
      1500
    )
    return () => clearTimeout(t)
  }, [filters.search, searchPlace])

  // Which surfaces get used: listings, map, or the embedded Google verticals.
  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false
      return
    }
    trackEvent('view_changed', { view })
  }, [view])

  const activeFilterCount = [
    filters.search,
    filters.neighborhood,
    filters.city,
    filters.county,
    filters.program,
    filters.incentive,
    filters.bedroom,
    filters.maxRent > 0,
    filters.hasListings,
    filters.availableNow,
    filters.favoritesOnly,
  ].filter(Boolean).length

  const pageCount = Math.ceil(total / PAGE_SIZE)
  const placeContext = filters.neighborhood || filters.city || filters.county || searchPlace

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gsurface-dark">
      <SearchHeader
        search={filters.search}
        onSearch={handleSearch}
        view={view}
        onViewChange={setView}
        toolsOpen={toolsOpen}
        onToolsToggle={() => setToolsOpen((o) => !o)}
        activeFilterCount={activeFilterCount}
        onClearAll={clearFilters}
      />

      {/* Filter chips only apply to this concept's own views, not the embeds */}
      {!FRAME_TABS[view] && (
      <FilterBar
        filters={filters}
        neighborhoods={neighborhoods}
        cities={cities}
        counties={counties}
        favoriteCount={favoriteCount}
        favoritesState={{
          properties: favoriteProperties,
          units: favoriteUnits,
          places: favoritePlaces,
        }}
        toolsOpen={toolsOpen}
        onToolsToggle={() => setToolsOpen((o) => !o)}
        onChange={handleFilterChange}
        onClearAll={clearFilters}
        hasActiveFilters={activeFilterCount > 0}
      />
      )}

      {/* Shared list banner */}
      {shared && (
        <div className="bg-[#e8f0fe] dark:bg-[#1f3049] text-google-blue-deep dark:text-google-link-dark px-4 sm:px-5 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm shrink-0">
          <span>
            ♥ Viewing a shared list —{' '}
            <strong>
              {total} propert{total !== 1 ? 'ies' : 'y'}
            </strong>
            {shared.units.length > 0 && <> and <strong>{shared.units.length} saved apartment{shared.units.length !== 1 ? 's' : ''}</strong></>}
            {/* A listing can vanish between sharing and opening — say so rather
                than quietly showing fewer than the sender picked. */}
            {!loading && total < activeFavoriteIds.length && (
              <span className="opacity-75">
                {' '}· {activeFavoriteIds.length - total} no longer listed
              </span>
            )}
          </span>
          <button
            onClick={acceptShared}
            className="text-xs font-medium px-3.5 h-7 rounded-full bg-google-blue-ink text-white hover:bg-google-blue-deep dark:bg-google-link-dark dark:text-[#202124] transition-colors"
          >
            Save to my list
          </button>
          <button onClick={dismissShared} className="text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Body */}
      <div className="relative flex flex-1 overflow-hidden">
        {view === 'listings' && (
          <>
            {/* Results rail: a fixed third of the width, Google Maps style.
                The map takes the rest — and gives half of it up to the details
                panel when a property is open. */}
            <div
              ref={listRef}
              className="w-full lg:w-1/3 lg:shrink-0 min-w-0 overflow-y-auto scrollbar-thin lg:border-r lg:border-gline/60 dark:lg:border-gline-dark/60"
            >
              <div className="px-4 sm:px-5 pb-10">
                {/* Stats line */}
                <p className="pt-3 pb-1 text-[13px] text-gink-tertiary dark:text-gink-dark-tertiary">
                  {loading ? (
                    'Searching…'
                  ) : (
                    <>
                      About {total.toLocaleString()} result{total !== 1 ? 's' : ''}
                      {elapsed != null && ` (${elapsed} seconds)`}
                      {placeContext && ` · in ${placeContext}`}
                    </>
                  )}
                </p>

                {loading ? (
                  <ResultSkeleton />
                ) : properties.length === 0 ? (
                  /* The classic empty state */
                  <div className="mt-8 text-sm text-gink dark:text-gink-dark space-y-4">
                    <p>
                      Your search
                      {filters.search ? (
                        <> — <strong>{filters.search}</strong> —</>
                      ) : (
                        ' with these filters'
                      )}{' '}
                      did not match any housing listings.
                    </p>
                    <div>
                      <p className="mb-1.5">Suggestions:</p>
                      <ul className="list-disc pl-6 space-y-1 text-gink-secondary dark:text-gink-dark-secondary">
                        <li>Make sure all words are spelled correctly.</li>
                        <li>Try different or more general keywords.</li>
                        <li>Try removing the rent or availability filters.</li>
                      </ul>
                    </div>
                    <button
                      onClick={clearFilters}
                      className="text-google-blue-ink dark:text-google-link-dark hover:underline"
                    >
                      Clear all filters
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 space-y-4">
                      {properties.map((p) => (
                        <PropertyCard
                          key={p.id}
                          property={p}
                          isSelected={selectedId === p.id}
                          onClick={() => handleCardClick(p.id)}
                          isFavorite={isPropertyFavorite(p.id)}
                          onToggleFavorite={() =>
                            toggleProperty(p.id, { address: p.address, city: p.city })
                          }
                          savedUnitCount={sharedSavedUnitCount(p.id)}
                          highlighted={savedIds.has(Number(p.id))}
                        />
                      ))}
                    </div>

                    {pageCount > 1 && (
                      <GooglePager
                        page={filters.page}
                        pageCount={pageCount}
                        onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
                      />
                    )}
                  </>
                )}

                {/* Google-style footer */}
                {!loading && (
                  <footer className="mt-12 border-t border-gline dark:border-gline-dark pt-5 text-[13px] text-gink-secondary dark:text-gink-dark-secondary space-y-3">
                    <p className="text-gink-tertiary dark:text-gink-dark-tertiary">
                      Washington State, USA — indexed from public housing data
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <a href="/about" className="hover:underline">About</a>
                      <a href="/privacy" className="hover:underline">Privacy</a>
                      <a href="/terms" className="hover:underline">Terms</a>
                      <a href="/disclaimer" className="hover:underline">Disclaimer</a>
                      <span className="text-gink-tertiary dark:text-gink-dark-tertiary">
                        Concept project — not affiliated with Google
                      </span>
                    </div>
                  </footer>
                )}
              </div>
            </div>

          </>
        )}

        {FRAME_TABS[view] && <GoogleFrame tab={view} search={filters.search} />}

        {/* One map instance for every view — the wrapper reshapes from
            knowledge-panel card ("Listings") to full bleed ("Maps") and simply
            hides for the google.com embeds. Keeping it mounted avoids tearing
            Leaflet down mid-animation on tab switches. */}
        <aside
          className={
            view === 'map'
              ? 'flex flex-col flex-1 min-h-0'
              : view === 'listings'
              ? 'hidden lg:flex flex-col flex-1 min-w-0 p-4 pl-2 gap-2 min-h-0'
              : 'hidden'
          }
        >
          <div
            className={`flex-1 min-h-0 relative overflow-hidden ${
              view === 'map' ? '' : 'rounded-2xl border border-gline dark:border-gline-dark'
            }`}
          >
            <Map
              properties={visibleMapProperties}
              highlightId={selectedId}
              onSelect={handleMapSelect}
              fitTo={filters.city || filters.county || searchPlace}
              savedIds={savedIds}
              savedUnitCountFor={sharedSavedUnitCount}
            />
          </div>
          {view === 'listings' && (
            <div className="flex items-center justify-between text-xs text-gink-tertiary dark:text-gink-dark-tertiary px-1">
              <span>{visibleMapProperties.length.toLocaleString()} places shown</span>
              <button
                onClick={() => setView('map')}
                className="text-google-blue-ink dark:text-google-link-dark hover:underline"
              >
                Open full map
              </button>
            </div>
          )}
        </aside>

        {/* Phone-only floating view switcher, Google Maps style — below lg the
            Listings view has no map panel, so this is how the map is reached
            without hunting for the Maps tab. */}
        {view === 'listings' && (
          <button
            type="button"
            onClick={() => setView('map')}
            className="lg:hidden absolute bottom-5 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-2 h-11 px-5 rounded-full bg-gink text-white dark:bg-gink-dark dark:text-[#202124] text-sm font-medium shadow-lg"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
            </svg>
            Map
          </button>
        )}
        {view === 'map' && (
          <button
            type="button"
            onClick={() => setView('listings')}
            className="lg:hidden absolute bottom-5 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-2 h-11 px-5 rounded-full bg-gink text-white dark:bg-gink-dark dark:text-[#202124] text-sm font-medium shadow-lg"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            List
          </button>
        )}

        {/* Property details. In the Listings view it joins the row as an
            equal third column (results 1/3 | map 1/3 | details 1/3); in the
            Maps view it slides over the map's right edge. No backdrop — the
            list and map stay live, and picking another property swaps the
            content in place. Below lg it overlays full-width either way. */}
        {modalId && (view === 'listings' || view === 'map') && (
          <div
            className={`panel-slide-in ${
              view === 'listings'
                ? 'absolute inset-y-0 right-0 z-[1200] w-full lg:static lg:inset-auto lg:z-auto lg:w-1/3 lg:shrink-0 lg:min-w-0'
                : 'absolute inset-y-0 right-0 z-[1200] w-full sm:w-[440px] xl:w-[480px]'
            }`}
          >
            <PropertyPanel
              propertyId={modalId}
              sharedUnitKeys={sharedUnitKeys}
              onClose={() => {
                setModalId(null)
                setSelectedId(null)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
