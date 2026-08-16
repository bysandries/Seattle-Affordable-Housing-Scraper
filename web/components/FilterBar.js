'use client'

import ShareFavorites from '@/components/ShareFavorites'

const BEDROOM_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'Micro', label: 'Micro' },
  { value: 'Studio', label: 'Studio' },
  { value: '1-Bedroom', label: '1 Bed' },
  { value: '2-Bedroom', label: '2 Bed' },
  { value: '3-Bedroom', label: '3 Bed' },
]

// Dot colors match the map legend so chips and markers read as one system.
const PROGRAM_OPTIONS = [
  { value: 'Mixed Market and Affordable', label: 'Mixed Market', dot: '#f9ab00' },
  { value: 'Fully Affordable', label: 'Fully Affordable', dot: '#188038' },
  { value: 'Market Rate', label: 'Market Rate', dot: '#1a73e8' },
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

// Material filter chip: tonal blue when selected, outlined otherwise.
function Chip({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] border transition-colors ${
        active
          ? 'bg-[#e8f0fe] text-google-blue-deep border-transparent dark:bg-[#1f3049] dark:text-google-link-dark'
          : 'bg-white text-gink-secondary border-gline hover:bg-gsurface-dim dark:bg-transparent dark:text-gink-dark-secondary dark:border-gline-dark dark:hover:bg-gsurface-dark-chip/50'
      }`}
    >
      {active && (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.5 12.5l5 5 10-11" />
        </svg>
      )}
      {children}
    </button>
  )
}

const selectClass =
  'w-full text-sm rounded-lg px-3 py-2 border border-gline bg-white text-gink focus:border-google-blue-ink focus:outline-none focus:ring-2 focus:ring-[#e8f0fe] dark:bg-gsurface-dark-raised dark:text-gink-dark dark:border-gline-dark dark:focus:ring-[#1f3049]'

export default function FilterBar({
  filters,
  neighborhoods,
  cities = [],
  counties = [],
  favoriteCount = 0,
  favoritesState,
  toolsOpen,
  onToolsToggle,
  onChange,
  onClearAll,
  hasActiveFilters,
}) {
  const set = (key, value) => onChange({ ...filters, [key]: value, page: 1 })

  return (
    <div className="shrink-0 border-b border-gline dark:border-gline-dark bg-white dark:bg-gsurface-dark">
      {/* Chip strip */}
      <div className="px-4 sm:px-5 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {/* Google Shopping-style refine chip: opens the Tools panel */}
        <button
          type="button"
          onClick={onToolsToggle}
          title="All filters"
          aria-label="All filters"
          aria-expanded={toolsOpen}
          className={`shrink-0 flex items-center justify-center h-8 w-11 rounded-full border transition-colors ${
            toolsOpen
              ? 'bg-[#e8f0fe] text-google-blue-deep border-transparent dark:bg-[#1f3049] dark:text-google-link-dark'
              : 'bg-white text-gink-secondary border-gline hover:bg-gsurface-dim dark:bg-transparent dark:text-gink-dark-secondary dark:border-gline-dark dark:hover:bg-gsurface-dark-chip/50'
          }`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
            <circle cx="16" cy="7" r="2.2" />
            <circle cx="8" cy="17" r="2.2" />
          </svg>
        </button>

        <Chip
          active={filters.favoritesOnly}
          onClick={() => set('favoritesOnly', !filters.favoritesOnly)}
          title="Show only properties you have saved"
        >
          {filters.favoritesOnly ? '♥' : '♡'} Saved
          {favoriteCount > 0 && <span className="font-bold">{favoriteCount}</span>}
        </Chip>

        <ShareFavorites state={favoritesState} disabled={favoriteCount === 0} />

        <Chip active={filters.hasListings} onClick={() => set('hasListings', !filters.hasListings)}>
          Live pricing
        </Chip>

        <Chip
          active={filters.availableNow}
          onClick={() => set('availableNow', !filters.availableNow)}
          title="Units listed as available now, or whose availability date has arrived"
        >
          Available now
        </Chip>

        <span className="w-px h-5 mx-0.5 bg-gline dark:bg-gline-dark shrink-0" aria-hidden="true" />

        {PROGRAM_OPTIONS.map((opt) => {
          const active = filters.program === opt.value
          return (
            <Chip key={opt.value} active={active} onClick={() => set('program', active ? '' : opt.value)}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.dot }} />
              {opt.label}
            </Chip>
          )
        })}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="shrink-0 ml-1 text-[13px] text-google-blue-ink dark:text-google-link-dark hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Tools panel */}
      {toolsOpen && (
        <div className="px-4 sm:px-5 pb-4 pt-1 border-t border-gline/60 dark:border-gline-dark/60">
          <div className="max-w-[900px] grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium mb-1.5">
                County
              </label>
              <select value={filters.county} onChange={(e) => set('county', e.target.value)} className={selectClass}>
                <option value="">All counties</option>
                {counties.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium mb-1.5">
                City
              </label>
              <select value={filters.city} onChange={(e) => set('city', e.target.value)} className={selectClass}>
                <option value="">All Washington</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium mb-1.5">
                Neighborhood <span className="font-normal">(Seattle)</span>
              </label>
              <select
                value={filters.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
                className={selectClass}
              >
                <option value="">All neighborhoods</option>
                {neighborhoods.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium mb-1.5">
                Bedrooms
              </label>
              <select value={filters.bedroom} onChange={(e) => set('bedroom', e.target.value)} className={selectClass}>
                {BEDROOM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium mb-1.5">
                Incentive program
              </label>
              <select
                value={filters.incentive}
                onChange={(e) => set('incentive', e.target.value)}
                title="MFTE, Incentive Zoning and MHA are market-rate buildings with set-aside affordable units. “None of these” covers the rest — LIHTC, project-based Section 8 and city-funded buildings."
                className={selectClass}
              >
                {INCENTIVE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium mb-1.5">
                Max rent / month
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {RENT_PRESETS.map((p) => (
                  <Chip key={p.value} active={filters.maxRent === p.value} onClick={() => set('maxRent', p.value)}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
