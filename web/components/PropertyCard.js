'use client'

import { HeartButton } from '@/lib/favorites'

const BEDROOM_LABELS = {
  micro: 'Micro',
  studio: 'Studio',
  '1-bedroom': '1 Bed',
  '2-bedroom': '2 Bed',
  '3-bedroom': '3 Bed',
  '1br': '1 Bed',
  '2br': '2 Bed',
  '3br': '3 Bed',
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

// "Studio, 1 & 2 Bed" — the Google-ad style title fragment.
function joinTypes(types) {
  if (types.length === 0) return ''
  if (types.length === 1) return types[0]
  return `${types.slice(0, -1).join(', ')} & ${types[types.length - 1]}`
}

// Google tonal palettes per program, reused by the favicon circle and chip.
const PROGRAM_STYLE = {
  'Mixed Market and Affordable': {
    short: 'Mixed',
    chip: 'bg-[#fef7e0] text-[#b06000] dark:bg-[#4a3c1a] dark:text-[#fdd663]',
  },
  'Fully Affordable': {
    short: 'Affordable',
    chip: 'bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a29] dark:text-[#81c995]',
  },
  'Market Rate': {
    short: 'Market Rate',
    chip: 'bg-[#e8f0fe] text-[#1967d2] dark:bg-[#1f3049] dark:text-[#8ab4f8]',
  },
}

// Incentive programs a building can carry; absent on properties outside them.
const INCENTIVE_BADGES = [
  { key: 'has_mfte', label: 'MFTE' },
  { key: 'has_iz', label: 'IZ' },
  { key: 'has_mha', label: 'MHA' },
]

// The address doubles as the result's "URL" line, google.com/rent style.
function fakeUrlPath(property) {
  const slug = (property.building_name || 'listing')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `washington.gov/housing › ${(property.city || 'seattle').toLowerCase()} › ${slug}`
}

// Build the gray snippet sentence the way a search result would describe a
// property listing.
function buildSnippet(property, brTypes) {
  const bits = []
  if (property.min_rent) bits.push(`Rates starting at $${property.min_rent.toLocaleString()}/mo.`)
  if (property.available_now_count > 0) {
    bits.push(
      `${property.available_now_count} unit${property.available_now_count !== 1 ? 's' : ''} available for immediate move-in.`
    )
  } else if (property.next_available_date) {
    bits.push(`Next availability ${formatShortDate(property.next_available_date)}.`)
  }
  if (property.amis) bits.push(`Income-restricted at ${property.amis} AMI.`)
  if (property.income_restricted_units > 0) {
    bits.push(`${property.income_restricted_units} of ${property.total_units} units restricted.`)
  }
  if (brTypes.length) bits.push(`${joinTypes(brTypes)} floor plans.`)
  if (!property.min_rent) bits.push('Contact the leasing office for current pricing.')
  return bits.join(' ')
}

export default function PropertyCard({
  property,
  isSelected,
  onClick,
  isFavorite,
  onToggleFavorite,
  savedUnitCount = 0,
  // Whether this building belongs to the list being shown. Distinct from
  // isFavorite: viewing someone's shared list highlights their picks, while the
  // heart keeps reflecting what the viewer themselves saved.
  highlighted,
}) {
  const style = PROGRAM_STYLE[property.program] ?? PROGRAM_STYLE['Fully Affordable']
  const hasListings = property.listing_count > 0
  const brTypes = parseBrTypes(property.br_types)
  const marked = highlighted ?? (isFavorite || savedUnitCount > 0)
  const typesFragment = joinTypes(brTypes)

  return (
    // A div rather than a button: the result contains its own favorite button,
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
      className={`group relative w-full text-left rounded-2xl px-4 py-3 -mx-4 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-google-blue ${
        isSelected
          ? 'bg-gsurface-dim dark:bg-gsurface-dark-raised'
          : marked
          ? 'bg-[#fce8e6]/60 hover:bg-[#fce8e6] dark:bg-[#3c2a29]/60 dark:hover:bg-[#3c2a29]'
          : 'hover:bg-gsurface-dim dark:hover:bg-gsurface-dark-raised/60'
      }`}
    >
      {/* Site row: favicon circle + name + "url" */}
      <div className="flex items-center gap-3">
        <span
          className={`w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center text-[13px] font-display font-medium ${style.chip}`}
          aria-hidden="true"
        >
          {(property.building_name || '?').charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-[13px] text-gink dark:text-gink-dark truncate">
            {property.building_name}
          </div>
          <div className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary truncate">
            {fakeUrlPath(property)}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {savedUnitCount > 0 && (
            <span
              className="text-xs font-medium text-[#c5221f] dark:text-[#f28b82]"
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

      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {/* Blue title */}
          <h3 className="mt-1.5 text-xl leading-snug text-google-link dark:text-google-link-dark group-hover:underline">
            {property.building_name}
            {typesFragment ? ` | ${typesFragment} Apartments` : ''}
            {property.neighborhood ? ` in ${property.neighborhood}` : property.city ? ` in ${property.city}` : ''}
          </h3>

          {/* Snippet */}
          <p className="mt-1 text-sm leading-[1.58] text-gink-secondary dark:text-gink-dark-secondary">
            <span className="text-gink-tertiary dark:text-gink-dark-tertiary">{property.address} — </span>
            {buildSnippet(property, brTypes)}
          </p>
        </div>

        {/* Listing photo, hot-linked from the property's own listing site the
            way search results carry thumbnails. Broken links (the listing
            closed) hide themselves rather than showing a broken-image glyph. */}
        {property.image_url && (
          <img
            src={property.image_url}
            alt={`${property.building_name} listing photo`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
            className="shrink-0 w-[92px] h-[92px] sm:w-[104px] sm:h-[104px] mt-2 rounded-xl object-cover bg-gsurface-chip dark:bg-gsurface-dark-chip"
          />
        )}
      </div>

      {/* Metadata chips */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {hasListings && (
          <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a29] dark:text-[#81c995]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34a853] animate-pulse" />
            Live pricing
          </span>
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.chip}`}>
          {style.short}
        </span>
        {INCENTIVE_BADGES.filter((b) => property[b.key]).map((b) => (
          <span
            key={b.key}
            className="text-xs font-medium px-2 py-0.5 rounded-full bg-gsurface-chip text-gink-secondary dark:bg-gsurface-dark-chip dark:text-gink-dark-secondary"
          >
            {b.label}
          </span>
        ))}
        {property.expiration_date && (
          <span className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary">
            program exp. {property.expiration_date}
          </span>
        )}
        {property.min_rent ? (
          <span className="ml-auto text-sm font-medium text-gink dark:text-gink-dark">
            from ${property.min_rent.toLocaleString()}
            <span className="text-gink-tertiary dark:text-gink-dark-tertiary font-normal text-xs">/mo</span>
          </span>
        ) : (
          <span className="ml-auto text-xs font-medium text-google-blue-ink dark:text-google-link-dark">
            Contact for pricing
          </span>
        )}
      </div>
    </div>
  )
}
