'use client'

import { HeartButton } from '@/lib/favorites'

function AmiDot({ amis }) {
  const val = parseInt(amis)
  let color = 'bg-slate-300'
  if (!isNaN(val)) {
    if (val <= 30) color = 'bg-emerald-500'
    else if (val <= 50) color = 'bg-blue-500'
    else if (val <= 65) color = 'bg-teal-500'
    else if (val <= 80) color = 'bg-amber-400'
    else color = 'bg-orange-400'
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

const BEDROOM_LABELS = {
  micro: 'Micro',
  studio: 'Studio',
  '1-bedroom': '1BR',
  '2-bedroom': '2BR',
  '3-bedroom': '3BR',
  '1br': '1BR',
  '2br': '2BR',
  '3br': '3BR',
}

function parseBrTypes(brTypes) {
  if (!brTypes) return []
  return brTypes
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => BEDROOM_LABELS[s] || s)
    .filter((v, i, a) => a.indexOf(v) === i)
}

function formatShortDate(iso) {
  const [y, m, d] = (iso || '').split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Incentive programs a building can carry; absent on properties outside them.
const INCENTIVE_BADGES = [
  { key: 'has_mfte', label: 'MFTE', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  { key: 'has_iz', label: 'IZ', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { key: 'has_mha', label: 'MHA', className: 'bg-rose-50 text-rose-700 border-rose-200' },
]

function parseAvailableTypes(types) {
  if (!types) return []
  return types
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BEDROOM_LABELS[s] || s)
}

const PROGRAM_BADGE = {
  'Mixed Market and Affordable': { label: 'Mixed', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  'Fully Affordable': { label: 'Affordable', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  'Market Rate': { label: 'Market Rate', className: 'bg-sky-50 text-sky-700 border-sky-200' },
}

export default function PropertyCard({
  property,
  isSelected,
  onClick,
  isFavorite,
  onToggleFavorite,
  savedUnitCount = 0,
}) {
  const badge = PROGRAM_BADGE[property.program] ?? PROGRAM_BADGE['Fully Affordable']
  const hasListings = property.listing_count > 0
  const brTypes = parseBrTypes(property.br_types)
  const liveTypes = parseAvailableTypes(property.available_types)

  return (
    // A div rather than a button: the card contains its own favorite button,
    // and nesting interactive controls inside a button is invalid.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={`w-full text-left bg-white rounded-xl border-2 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 p-4 flex flex-col gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${
        isSelected
          ? 'border-blue-500 shadow-md shadow-blue-100'
          : 'border-slate-100 hover:border-slate-300'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 text-sm leading-tight truncate">
            {property.building_name}
          </h3>
          <p className="text-slate-400 text-xs truncate mt-0.5">{property.address}</p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {hasListings ? (
            <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 text-xs font-medium px-2 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          ) : null}
          {savedUnitCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-rose-600 bg-rose-50 border border-rose-200 text-xs font-medium px-2 py-0.5 rounded-full"
              title={`${savedUnitCount} saved apartment${savedUnitCount !== 1 ? 's' : ''} here`}
            >
              ♥ {savedUnitCount}
            </span>
          )}
          <HeartButton
            active={isFavorite}
            onToggle={onToggleFavorite}
            size="sm"
            label="saved buildings"
          />
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
          {property.neighborhood}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${badge.className}`}>
          {badge.label}
        </span>
        {INCENTIVE_BADGES.filter((b) => property[b.key]).map((b) => (
          <span
            key={b.key}
            className={`text-xs px-2 py-0.5 rounded-full font-medium border ${b.className}`}
          >
            {b.label}
          </span>
        ))}
      </div>

      {/* AMI + Units */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {property.amis && (
          <span className="flex items-center gap-1">
            <AmiDot amis={property.amis} />
            {property.amis} AMI
          </span>
        )}
        {property.income_restricted_units > 0 && (
          <span>
            {property.income_restricted_units}/{property.total_units} restricted
          </span>
        )}
        {property.expiration_date && (
          <span className="text-slate-400">exp. {property.expiration_date}</span>
        )}
      </div>

      {/* Bedroom types */}
      <div className="flex flex-wrap gap-1">
        {brTypes.slice(0, 5).map((b) => (
          <span
            key={b}
            className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
          >
            {b}
          </span>
        ))}
      </div>

      {/* Pricing / Availability */}
      <div className="mt-1 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {property.available_now_count > 0 ? (
              <span className="text-emerald-600 font-medium">
                {property.available_now_count} available now
              </span>
            ) : property.next_available_date ? (
              <span className="text-blue-600 font-medium">
                From {formatShortDate(property.next_available_date)}
              </span>
            ) : hasListings && liveTypes.length > 0 ? (
              `${liveTypes.join(' · ')} available`
            ) : (
              'Check availability'
            )}
          </div>
          {property.min_rent ? (
            <div className="text-sm font-semibold text-slate-800">
              from ${property.min_rent.toLocaleString()}
              <span className="text-slate-400 font-normal text-xs">/mo</span>
            </div>
          ) : (
            <div className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
              Contact for Pricing
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
