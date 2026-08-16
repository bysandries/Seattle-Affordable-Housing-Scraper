'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { HeartButton, unitKey, useFavorites } from '@/lib/favorites'

const UNIT_LABELS = {
  micro: 'Micro',
  studio: 'Studio',
  '1br': '1 Bed',
  '2br': '2 Bed',
  '3br': '3 Bed',
  unknown: 'Unit',
}

const AVAIL_STYLES = {
  now: 'bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a29] dark:text-[#81c995]',
  future: 'bg-[#e8f0fe] text-[#1967d2] dark:bg-[#1f3049] dark:text-[#8ab4f8]',
  waitlist: 'bg-[#fef7e0] text-[#b06000] dark:bg-[#4a3c1a] dark:text-[#fdd663]',
}

// Google tonal chip per program, matching the result list and map legend.
const PROGRAM_CHIP = {
  'Mixed Market and Affordable': 'bg-[#fef7e0] text-[#b06000] dark:bg-[#4a3c1a] dark:text-[#fdd663]',
  'Market Rate': 'bg-[#e8f0fe] text-[#1967d2] dark:bg-[#1f3049] dark:text-[#8ab4f8]',
  'Fully Affordable': 'bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a29] dark:text-[#81c995]',
}

const thClass =
  'px-3 py-2.5 text-xs font-medium text-gink-tertiary dark:text-gink-dark-tertiary'

function formatDate(iso) {
  if (!iso) return null
  // Parse as local, not UTC, so the date never shifts a day backwards.
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function AvailBadge({ unit }) {
  // availability_status is frozen at scrape time, so a date that has since
  // passed would still read "future". Re-derive it against today.
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  let status = unit.availability_status
  if (status === 'future' && unit.available_date && unit.available_date <= todayIso) {
    status = 'now'
  }
  const pretty = formatDate(unit.available_date)

  if (!status || status === 'unknown') {
    // Fall back to whatever raw text was scraped, if anything.
    return unit.available_from ? (
      <span className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary">{unit.available_from}</span>
    ) : (
      <span className="text-gink-tertiary dark:text-gink-dark-tertiary text-xs">—</span>
    )
  }

  const label =
    status === 'now'
      ? 'Available now'
      : status === 'waitlist'
      ? pretty
        ? `Waitlist · ${pretty}`
        : 'Waitlist'
      : pretty || unit.available_from

  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
        AVAIL_STYLES[status] ?? 'bg-gsurface-chip text-gink-secondary dark:bg-gsurface-dark-chip dark:text-gink-dark-secondary'
      }`}
    >
      {label}
    </span>
  )
}

function MiniMap({ lat, long, name }) {
  const ref = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!ref.current || !lat || !long) return
    import('leaflet').then((L) => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      const map = L.map(ref.current, { zoomControl: false, dragging: false, scrollWheelZoom: false })
        .setView([lat, long], 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map)
      L.marker([lat, long]).addTo(map).bindPopup(name).openPopup()
      mapRef.current = map
    })
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, [lat, long, name])

  return (
    <div
      ref={ref}
      className="w-full h-40 rounded-2xl overflow-hidden border border-gline dark:border-gline-dark"
    />
  )
}

/**
 * Property details as a side panel (Google Maps place-panel style), not a
 * modal: no backdrop, the page stays interactive, and selecting another
 * property swaps the content in place. The ✕ (or Escape) closes it.
 */
export default function PropertyPanel({ propertyId, onClose, sharedUnitKeys }) {
  const { isPropertyFavorite, toggleProperty, isUnitFavorite, toggleUnit } = useFavorites()
  // Units the shared list marked. Shown as saved so a recipient sees exactly
  // which apartments were picked, even before importing the list.
  const inShared = (unit) => !!sharedUnitKeys && sharedUnitKeys.has(unitKey(unit))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  // Photo URLs whose CDN link has died (the listing closed) — dropped from the
  // carousel instead of showing a broken frame.
  const [broken, setBroken] = useState(() => new Set())
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!propertyId) return
    setLoading(true)
    setData(null)
    setPhotoIdx(0)
    setLightbox(false)
    setBroken(new Set())
    fetch(`/api/properties/${propertyId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
    // A new selection starts reading from the top, not wherever the previous
    // property was scrolled to.
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [propertyId])

  const chip = PROGRAM_CHIP[data?.program] ?? PROGRAM_CHIP['Fully Affordable']
  const units = data?.units?.filter((u) => u.rent_min || u.available_from) ?? []

  // Every distinct listing photo, labeled by the unit it belongs to. Powers
  // the carousel, the thumbnail rail and the lightbox. Hot-linked from the
  // source, never copied.
  const photos = useMemo(() => {
    const out = []
    const seen = new Set()
    for (const u of data?.units ?? []) {
      if (!u.image_url || seen.has(u.image_url) || broken.has(u.image_url)) continue
      seen.add(u.image_url)
      out.push({
        src: u.image_url,
        href: u.listing_url,
        label: `${UNIT_LABELS[u.unit_type] || u.unit_type}${
          u.rent_min ? ` · $${u.rent_min.toLocaleString()}/mo` : ''
        }${u.sqft ? ` · ${u.sqft} sqft` : ''}`,
      })
    }
    return out
  }, [data, broken])

  // photoIdx can point past the end after a broken photo drops out.
  const idx = photos.length ? Math.min(photoIdx, photos.length - 1) : 0
  const stepPhoto = (d) =>
    setPhotoIdx(photos.length ? (idx + d + photos.length) % photos.length : 0)
  const markBroken = (src) => setBroken((b) => new Set(b).add(src))

  const openLightboxAt = (src) => {
    const i = photos.findIndex((p) => p.src === src)
    if (i >= 0) {
      setPhotoIdx(i)
      setLightbox(true)
    }
  }

  // Escape closes the lightbox first, then the panel; arrows page through
  // photos while the lightbox is up.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(false)
        else onClose()
      } else if (lightbox && photos.length > 1) {
        if (e.key === 'ArrowRight') stepPhoto(1)
        if (e.key === 'ArrowLeft') stepPhoto(-1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    <aside
      className="h-full flex flex-col bg-white dark:bg-gsurface-dark-raised border-l border-gline dark:border-gline-dark shadow-2xl"
      aria-label="Property details"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 shrink-0 border-b border-gline/60 dark:border-gline-dark/60 relative">
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <HeartButton
            active={isPropertyFavorite(propertyId)}
            onToggle={() =>
              toggleProperty(propertyId, { address: data?.address, city: data?.city })
            }
            label="saved buildings"
          />
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full text-gink-secondary dark:text-gink-dark-secondary hover:bg-gsurface-chip dark:hover:bg-gsurface-dark-chip transition-colors"
            aria-label="Close details"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="h-14 flex items-center">
            <div className="h-4 w-48 bg-gsurface-chip dark:bg-gsurface-dark-chip rounded animate-pulse" />
          </div>
        ) : (
          <>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full mb-1.5 inline-block ${chip}`}>
              {data.program}
            </span>
            <h2 className="font-display text-xl leading-6 text-gink dark:text-gink-dark pr-20">
              {data.building_name}
            </h2>
            <p className="text-gink-tertiary dark:text-gink-dark-tertiary text-sm mt-0.5">
              {data.address} · {data.neighborhood}
            </p>
          </>
        )}
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {!loading && data && (
          <div className="px-5 py-4 space-y-5">
            {/* Photo carousel — arrows page through every unit's photo, and
                clicking opens the lightbox instead of leaving the app. */}
            {photos.length > 0 && (
              <div>
                <div className="relative rounded-2xl overflow-hidden bg-gsurface-chip dark:bg-gsurface-dark-chip">
                  <img
                    src={photos[idx].src}
                    alt={`${data.building_name} — ${photos[idx].label}`}
                    referrerPolicy="no-referrer"
                    onError={() => markBroken(photos[idx].src)}
                    onClick={() => setLightbox(true)}
                    className="w-full h-52 object-cover cursor-zoom-in"
                  />
                  {/* Which apartment this photo belongs to */}
                  <span className="absolute bottom-2 left-2 text-[11px] font-medium text-white bg-black/60 rounded-full px-2.5 py-1 pointer-events-none">
                    {photos[idx].label}
                  </span>
                  {photos.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => stepPhoto(-1)}
                        aria-label="Previous photo"
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14.5 5.5L8 12l6.5 6.5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => stepPhoto(1)}
                        aria-label="Next photo"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9.5 5.5L16 12l-6.5 6.5" />
                        </svg>
                      </button>
                      <span className="absolute bottom-2 right-2 text-[11px] font-medium text-white bg-black/60 rounded-full px-2 py-1 pointer-events-none">
                        {idx + 1} / {photos.length}
                      </span>
                    </>
                  )}
                </div>

                {/* Thumbnail rail: jump straight to an apartment's photo */}
                {photos.length > 1 && (
                  <div className="flex gap-1.5 mt-1.5 overflow-x-auto no-scrollbar">
                    {photos.map((p, i) => (
                      <button
                        key={p.src}
                        type="button"
                        onClick={() => setPhotoIdx(i)}
                        aria-label={`Show photo ${i + 1}: ${p.label}`}
                        className={`shrink-0 rounded-lg overflow-hidden transition-opacity ${
                          i === idx
                            ? 'ring-2 ring-google-blue-ink dark:ring-google-link-dark'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={p.src}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() => markBroken(p.src)}
                          className="w-16 h-11 object-cover bg-gsurface-chip dark:bg-gsurface-dark-chip"
                        />
                      </button>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-gink-tertiary dark:text-gink-dark-tertiary mt-1.5">
                  Photos from the property's listing site — click a photo to enlarge
                </p>
              </div>
            )}

            {/* Key info grid */}
            <div className="grid grid-cols-2 gap-2.5 text-sm">
              {data.amis && (
                <div className="bg-gsurface-dim dark:bg-gsurface-dark-chip/60 rounded-xl p-3">
                  <div className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium">AMI range</div>
                  <div className="font-medium text-gink dark:text-gink-dark mt-0.5">{data.amis}</div>
                </div>
              )}
              {/* Statewide market-rate rows have no unit counts — the portal
                  publishes vacancies, not building totals. */}
              {data.total_units > 0 && (
                <div className="bg-gsurface-dim dark:bg-gsurface-dark-chip/60 rounded-xl p-3">
                  <div className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium">Units</div>
                  <div className="font-medium text-gink dark:text-gink-dark mt-0.5">
                    {data.income_restricted_units} restricted / {data.total_units} total
                  </div>
                </div>
              )}
              {data.expiration_date && (
                <div className="bg-gsurface-dim dark:bg-gsurface-dark-chip/60 rounded-xl p-3">
                  <div className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium">Program expiry</div>
                  <div className="font-medium text-gink dark:text-gink-dark mt-0.5">{data.expiration_date}</div>
                </div>
              )}
              {data.owner_management && (
                <div className="bg-gsurface-dim dark:bg-gsurface-dark-chip/60 rounded-xl p-3">
                  <div className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary font-medium">Management</div>
                  <div className="font-medium text-gink dark:text-gink-dark mt-0.5 text-xs leading-tight">
                    {data.owner_management}
                  </div>
                </div>
              )}
            </div>

            {/* Contact */}
            {(data.phone || data.website) && (
              <div className="flex flex-wrap gap-2">
                {data.phone && (
                  <a
                    href={`tel:${data.phone}`}
                    className="flex items-center gap-1.5 text-sm font-medium h-9 px-4 rounded-full border border-gline text-google-blue-ink hover:bg-[#e8f0fe]/50 dark:border-gline-dark dark:text-google-link-dark dark:hover:bg-[#1f3049]/60 transition-colors"
                  >
                    Call {data.phone}
                  </a>
                )}
                {data.website && (
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-medium h-9 px-4 rounded-full bg-google-blue-ink text-white hover:bg-google-blue-deep dark:bg-google-link-dark dark:text-[#202124] transition-colors"
                  >
                    Property website ↗
                  </a>
                )}
              </div>
            )}

            {/* Live unit listings */}
            {units.length > 0 && (
              <div>
                <h3 className="font-display font-medium text-gink dark:text-gink-dark mb-3 flex items-center gap-2">
                  Available units
                  <span className="bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a29] dark:text-[#81c995] text-xs font-medium px-2 py-0.5 rounded-full">
                    {units.length} listing{units.length !== 1 ? 's' : ''}
                  </span>
                </h3>
                {/* Material list rather than a table: each apartment shows its
                    own listing photo, so same-type units in one building are
                    tellable apart at a glance. */}
                <div className="border border-gline dark:border-gline-dark rounded-2xl overflow-hidden divide-y divide-gline/60 dark:divide-gline-dark/60">
                  {units.map((u, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-2 py-2.5 ${
                        u.listing_url
                          ? 'hover:bg-[#e8f0fe]/40 dark:hover:bg-[#1f3049]/40 cursor-pointer group'
                          : 'hover:bg-gsurface-dim dark:hover:bg-gsurface-dark-chip/40'
                      }`}
                      onClick={() =>
                        u.listing_url &&
                        window.open(u.listing_url, '_blank', 'noopener,noreferrer')
                      }
                    >
                      <HeartButton
                        active={isUnitFavorite(u) || inShared(u)}
                        onToggle={() =>
                          toggleUnit(u, propertyId, {
                            address: data?.address,
                            city: data?.city,
                          })
                        }
                        size="sm"
                        label="saved apartments"
                      />
                      {/* This unit's own photo — click enlarges it in the
                          lightbox rather than leaving the app. */}
                      {u.image_url ? (
                        <img
                          src={u.image_url}
                          alt={`${UNIT_LABELS[u.unit_type] || u.unit_type} listing photo`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            openLightboxAt(u.image_url)
                          }}
                          className="w-16 h-12 shrink-0 rounded-lg object-cover bg-gsurface-chip dark:bg-gsurface-dark-chip cursor-zoom-in"
                        />
                      ) : (
                        <span
                          className="w-16 h-12 shrink-0 rounded-lg bg-gsurface-chip dark:bg-gsurface-dark-chip flex items-center justify-center text-gink-tertiary/60 dark:text-gink-dark-tertiary/60"
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 11l9-7 9 7" />
                            <path d="M5 9.5V20h14V9.5" />
                          </svg>
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gink dark:text-gink-dark truncate">
                          {u.listing_url ? (
                            <a
                              href={u.listing_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-google-blue-ink dark:text-google-link-dark group-hover:underline"
                            >
                              {UNIT_LABELS[u.unit_type] || u.unit_type} ↗
                            </a>
                          ) : (
                            UNIT_LABELS[u.unit_type] || u.unit_type
                          )}
                        </div>
                        <div className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary mt-0.5">
                          {u.sqft ? `${u.sqft} sqft` : 'Size not listed'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <div className="text-sm font-medium text-gink dark:text-gink-dark whitespace-nowrap">
                          {u.rent_min
                            ? u.rent_min === u.rent_max
                              ? `$${u.rent_min.toLocaleString()}`
                              : `$${u.rent_min.toLocaleString()}–$${u.rent_max.toLocaleString()}`
                            : (
                              <span className="text-xs font-medium text-google-blue-ink dark:text-google-link-dark">
                                Contact for pricing
                              </span>
                            )}
                        </div>
                        <div>
                          <AvailBadge unit={u} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary mt-2">
                  ♡ saves a single apartment
                  {units.some((u) => u.listing_url) ? ' · click a unit to open its listing' : ''}
                  {' · prices may have changed since last indexed'}
                </p>
              </div>
            )}

            {/* No live listings message */}
            {units.length === 0 && (
              <div className="bg-gsurface-dim dark:bg-gsurface-dark-chip/50 rounded-2xl p-4 text-sm text-gink-secondary dark:text-gink-dark-secondary text-center">
                No live pricing data available.
                {data.website && (
                  <span>
                    {' '}
                    <a
                      href={data.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-google-blue-ink dark:text-google-link-dark hover:underline"
                    >
                      Visit the property website
                    </a>{' '}
                    for current availability.
                  </span>
                )}
              </div>
            )}

            {/* Affordable unit qualification */}
            {data.qualifications?.length > 0 && (
              <div>
                <h3 className="font-display font-medium text-gink dark:text-gink-dark mb-1 flex items-center gap-2 flex-wrap">
                  Affordable unit qualification
                  {data.affordable?.total_mfte_units > 0 && (
                    <span className="bg-[#e8f0fe] text-[#1967d2] dark:bg-[#1f3049] dark:text-[#8ab4f8] text-xs font-medium px-2 py-0.5 rounded-full">
                      {data.affordable.total_mfte_units} MFTE
                    </span>
                  )}
                  {data.affordable?.total_iz_units > 0 && (
                    <span className="bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a29] dark:text-[#81c995] text-xs font-medium px-2 py-0.5 rounded-full">
                      {data.affordable.total_iz_units} IZ
                    </span>
                  )}
                  {data.affordable?.total_mha_units > 0 && (
                    <span className="bg-[#fef7e0] text-[#b06000] dark:bg-[#4a3c1a] dark:text-[#fdd663] text-xs font-medium px-2 py-0.5 rounded-full">
                      {data.affordable.total_mha_units} MHA
                    </span>
                  )}
                </h3>
                {data.pageInfo?.has_waitlist_mention === 1 && (
                  <p className="text-xs text-[#b06000] dark:text-[#fdd663] bg-[#fef7e0] dark:bg-[#4a3c1a] rounded-xl px-3 py-2 mb-2">
                    ⏳ This property's website mentions a waitlist.
                    {data.pageInfo.info_url && (
                      <>
                        {' '}
                        <a
                          href={data.pageInfo.info_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          See details ↗
                        </a>
                      </>
                    )}
                  </p>
                )}
                <div className="border border-gline dark:border-gline-dark rounded-2xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gsurface-dim dark:bg-gsurface-dark-chip/50 border-b border-gline dark:border-gline-dark">
                      <tr>
                        <th className={`text-left ${thClass}`}>Unit</th>
                        <th className={`text-left ${thClass}`}>Program</th>
                        <th className={`text-right ${thClass}`}>AMI</th>
                        <th className={`text-right ${thClass}`}>Max rent</th>
                        <th className={`text-right ${thClass}`}>Max income (1p / 2p)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gline/60 dark:divide-gline-dark/60">
                      {data.qualifications.map((q, i) => (
                        <tr key={i} className="hover:bg-gsurface-dim dark:hover:bg-gsurface-dark-chip/40">
                          <td className="px-3 py-2.5 font-medium text-gink dark:text-gink-dark">{q.bedroom}</td>
                          <td className="px-3 py-2.5 text-gink-tertiary dark:text-gink-dark-tertiary">{q.program}</td>
                          <td className="px-3 py-2.5 text-right text-gink-tertiary dark:text-gink-dark-tertiary">{q.ami_pct}%</td>
                          <td className="px-3 py-2.5 text-right font-medium text-gink dark:text-gink-dark whitespace-nowrap">
                            {q.max_rent ? `$${q.max_rent.toLocaleString()}/mo` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gink-tertiary dark:text-gink-dark-tertiary text-xs whitespace-nowrap">
                            {q.income_limit_1
                              ? `$${q.income_limit_1.toLocaleString()} / $${q.income_limit_2?.toLocaleString() ?? '—'}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gink-tertiary dark:text-gink-dark-tertiary mt-2">
                  Estimated from the Seattle Office of Housing 2026–2027 rent &amp; income
                  schedules. Actual rents, unit assignments, and MFTE phase may differ —
                  verify with the property.
                </p>
              </div>
            )}

            {/* Mini map */}
            {data.lat && data.long && (
              <MiniMap lat={data.lat} long={data.long} name={data.building_name} />
            )}

            <div className="pb-2" />
          </div>
        )}
      </div>

      {/* Lightbox: the photo full-size in-app. Scrim or Escape closes it;
          arrows and ←/→ keys page through the building's photos. */}
      {lightbox && photos.length > 0 && (
        <div
          role="dialog"
          aria-label="Photo viewer"
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-[3000] bg-black/90 flex flex-col items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            aria-label="Close photo viewer"
            className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <img
            src={photos[idx].src}
            alt={`${data?.building_name ?? ''} — ${photos[idx].label}`}
            referrerPolicy="no-referrer"
            onError={() => markBroken(photos[idx].src)}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] max-w-[92vw] object-contain rounded-xl"
          />

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); stepPhoto(-1) }}
                aria-label="Previous photo"
                className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14.5 5.5L8 12l6.5 6.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); stepPhoto(1) }}
                aria-label="Next photo"
                className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9.5 5.5L16 12l-6.5 6.5" />
                </svg>
              </button>
            </>
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/90"
          >
            <span className="font-medium">{photos[idx].label}</span>
            <span className="text-white/50">
              {idx + 1} / {photos.length}
            </span>
            {photos[idx].href && (
              <a
                href={photos[idx].href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#8ab4f8] hover:underline"
              >
                Open this unit's listing ↗
              </a>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
