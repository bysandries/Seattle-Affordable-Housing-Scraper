'use client'

import { useEffect, useRef, useState } from 'react'
import ShareFavorites from '@/components/ShareFavorites'

const BEDROOM_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'Micro', label: 'Micro' },
  { value: 'Studio', label: 'Studio' },
  { value: '1-Bedroom', label: '1 Bed' },
  { value: '2-Bedroom', label: '2 Bed' },
  { value: '3-Bedroom', label: '3 Bed' },
]

const PROGRAM_OPTIONS = [
  { value: '', label: 'Any Property Type', activeClass: 'bg-slate-700 text-white border-slate-700' },
  { value: 'Mixed Market and Affordable', label: 'Mixed Market', activeClass: 'bg-amber-500 text-white border-amber-500' },
  { value: 'Fully Affordable', label: 'Fully Affordable', activeClass: 'bg-violet-600 text-white border-violet-600' },
  { value: 'Market Rate', label: 'Market Rate', activeClass: 'bg-sky-600 text-white border-sky-600' },
]

// Market-rate incentive programs tracked in affordable_buildings. "None" is the
// rest of the dataset — buildings affordable through LIHTC, project-based
// Section 8 or city funding rather than a zoning/tax incentive.
const INCENTIVE_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'mfte', label: 'MFTE' },
  { value: 'iz', label: 'Incentive Zoning (IZ)' },
  { value: 'mha', label: 'MHA' },
  { value: 'none', label: 'None of these' },
]

const RENT_PRESETS = [
  { label: 'Any', value: 0 },
  { label: '≤$1,000', value: 1000 },
  { label: '≤$1,500', value: 1500 },
  { label: '≤$2,000', value: 2000 },
  { label: '≤$2,500', value: 2500 },
  { label: '≤$3,000', value: 3000 },
]

export default function FilterBar({
  filters,
  neighborhoods,
  cities = [],
  counties = [],
  favoriteCount = 0,
  favoritesState,
  total,
  onChange,
}) {
  const [expanded, setExpanded] = useState(false)

  const set = (key, value) => onChange({ ...filters, [key]: value, page: 1 })

  // The search box is debounced: each keystroke refetches the list AND
  // re-filters every map marker, so propagating per-key freezes the page.
  // The draft keeps typing responsive; filters.search follows 250ms later.
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const searchTimer = useRef(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  // External resets (Clear filters, shared links) must update the box too.
  useEffect(() => { setSearchDraft(filters.search) }, [filters.search])
  useEffect(() => () => clearTimeout(searchTimer.current), [])

  const setSearch = (value) => {
    setSearchDraft(value)
    clearTimeout(searchTimer.current)
    // Read filters through the ref at fire time: another filter may have
    // changed during the debounce window and must not be reverted.
    searchTimer.current = setTimeout(
      () => onChange({ ...filtersRef.current, search: value, page: 1 }),
      250
    )
  }

  const activeCount = [
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

  return (
    <div className="border-b border-slate-200 bg-white">
      {/* Main search row */}
      <div className="px-4 py-3 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">🔍</span>
          <input
            type="text"
            placeholder="Search by name, address, neighborhood…"
            value={searchDraft}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-100 rounded-lg border-transparent focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all placeholder:text-slate-400"
          />
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors ${
            expanded || activeCount > 1
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
          }`}
        >
          ⚙ Filters
          {activeCount > 1 && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${expanded ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Quick toggles */}
      <div className="px-4 pb-2.5 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => set('favoritesOnly', !filters.favoritesOnly)}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
            filters.favoritesOnly
              ? 'bg-rose-500 text-white border-rose-500'
              : 'bg-white text-slate-600 border-slate-200 hover:border-rose-400'
          }`}
          title="Show only properties you have saved"
        >
          {filters.favoritesOnly ? '♥' : '♡'} Favorites
          {favoriteCount > 0 && (
            <span
              className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                filters.favoritesOnly ? 'bg-white text-rose-600' : 'bg-rose-100 text-rose-600'
              }`}
            >
              {favoriteCount}
            </span>
          )}
        </button>

        <ShareFavorites state={favoritesState} disabled={favoriteCount === 0} />

        <button
          onClick={() => set('hasListings', !filters.hasListings)}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
            filters.hasListings
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'
          }`}
        >
          ✓ Live pricing only
        </button>

        <button
          onClick={() => set('availableNow', !filters.availableNow)}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
            filters.availableNow
              ? 'bg-teal-600 text-white border-teal-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
          }`}
          title="Units listed as available now, or whose availability date has arrived"
        >
          🔑 Available now
        </button>

        {PROGRAM_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => set('program', opt.value)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              filters.program === opt.value
                ? opt.activeClass
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {opt.label}
          </button>
        ))}

        <span className="ml-auto text-xs text-slate-400">
          {total.toLocaleString()} properties
        </span>
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* County */}
          <div>
            <label className="block text-xs text-slate-500 font-medium mb-1.5">County</label>
            <select
              value={filters.county}
              onChange={(e) => set('county', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All counties</option>
              {counties.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="block text-xs text-slate-500 font-medium mb-1.5">City</label>
            <select
              value={filters.city}
              onChange={(e) => set('city', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All Washington</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Neighborhood */}
          <div>
            <label className="block text-xs text-slate-500 font-medium mb-1.5">
              Neighborhood <span className="text-slate-400 font-normal">(Seattle)</span>
            </label>
            <select
              value={filters.neighborhood}
              onChange={(e) => set('neighborhood', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All neighborhoods</option>
              {neighborhoods.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Bedroom */}
          <div>
            <label className="block text-xs text-slate-500 font-medium mb-1.5">Bedrooms</label>
            <select
              value={filters.bedroom}
              onChange={(e) => set('bedroom', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {BEDROOM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Incentive program */}
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs text-slate-500 font-medium mb-1.5">
              Incentive program
            </label>
            <select
              value={filters.incentive}
              onChange={(e) => set('incentive', e.target.value)}
              title="MFTE, Incentive Zoning and MHA are market-rate buildings with set-aside affordable units. “None of these” covers the rest — LIHTC, project-based Section 8 and city-funded buildings."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {INCENTIVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Max rent */}
          <div className="col-span-2 md:col-span-3">
            <label className="block text-xs text-slate-500 font-medium mb-1.5">Max rent / month</label>
            <div className="flex gap-1.5 flex-wrap">
              {RENT_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => set('maxRent', p.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    filters.maxRent === p.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
