'use client'

import { useState } from 'react'

const BEDROOM_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'Micro', label: 'Micro' },
  { value: 'Studio', label: 'Studio' },
  { value: '1-Bedroom', label: '1 Bed' },
  { value: '2-Bedroom', label: '2 Bed' },
  { value: '3-Bedroom', label: '3 Bed' },
]

const PROGRAM_OPTIONS = [
  { value: '', label: 'All programs' },
  { value: 'Mixed Market and Affordable', label: 'Mixed Market' },
  { value: 'Fully Affordable', label: 'Fully Affordable' },
]

const RENT_PRESETS = [
  { label: 'Any', value: 0 },
  { label: '≤$1,000', value: 1000 },
  { label: '≤$1,500', value: 1500 },
  { label: '≤$2,000', value: 2000 },
  { label: '≤$2,500', value: 2500 },
  { label: '≤$3,000', value: 3000 },
]

export default function FilterBar({ filters, neighborhoods, total, onChange }) {
  const [expanded, setExpanded] = useState(false)

  const set = (key, value) => onChange({ ...filters, [key]: value, page: 1 })

  const activeCount = [
    filters.search,
    filters.neighborhood,
    filters.program,
    filters.bedroom,
    filters.maxRent > 0,
    filters.hasListings,
    filters.availableNow,
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
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
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

        {PROGRAM_OPTIONS.slice(1).map((opt) => (
          <button
            key={opt.value}
            onClick={() => set('program', filters.program === opt.value ? '' : opt.value)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              filters.program === opt.value
                ? opt.value.includes('Mixed')
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-violet-600 text-white border-violet-600'
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
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Neighborhood */}
          <div>
            <label className="block text-xs text-slate-500 font-medium mb-1.5">Neighborhood</label>
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

          {/* Max rent */}
          <div className="col-span-2">
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
