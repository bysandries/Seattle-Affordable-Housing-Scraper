'use client'

import { useEffect, useRef, useState } from 'react'

const UNIT_LABELS = {
  micro: 'Micro',
  studio: 'Studio',
  '1br': '1 Bed',
  '2br': '2 Bed',
  '3br': '3 Bed',
  unknown: 'Unit',
}

const AVAIL_STYLES = {
  now: 'bg-emerald-100 text-emerald-700',
  future: 'bg-blue-50 text-blue-700',
  waitlist: 'bg-amber-50 text-amber-700',
}

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
      <span className="text-xs text-slate-500">{unit.available_from}</span>
    ) : (
      <span className="text-slate-400 text-xs">—</span>
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
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${AVAIL_STYLES[status] ?? 'bg-slate-100 text-slate-600'}`}>
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

  return <div ref={ref} className="w-full h-40 rounded-lg overflow-hidden border border-slate-200" />
}

export default function PropertyModal({ propertyId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const overlayRef = useRef(null)

  useEffect(() => {
    if (!propertyId) return
    setLoading(true)
    setData(null)
    fetch(`/api/properties/${propertyId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
  }, [propertyId])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  const isMixed = data?.program === 'Mixed Market and Affordable'
  const units = data?.units?.filter((u) => u.rent_min || u.available_from) ?? []

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        {/* Header */}
        <div
          className={`px-6 pt-6 pb-4 ${
            isMixed ? 'bg-amber-50' : 'bg-violet-50'
          } relative`}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-slate-500 hover:text-slate-900 transition-colors shadow"
            aria-label="Close"
          >
            ✕
          </button>

          {loading ? (
            <div className="h-16 flex items-center">
              <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
            </div>
          ) : (
            <>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full mb-2 inline-block ${
                  isMixed
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-violet-100 text-violet-700'
                }`}
              >
                {data.program}
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-1">{data.building_name}</h2>
              <p className="text-slate-500 text-sm">{data.address} · {data.neighborhood}</p>
            </>
          )}
        </div>

        {!loading && data && (
          <div className="px-6 py-4 space-y-5">
            {/* Key info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {data.amis && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide font-medium">AMI Range</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{data.amis}</div>
                </div>
              )}
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-400 uppercase tracking-wide font-medium">Units</div>
                <div className="font-semibold text-slate-800 mt-0.5">
                  {data.income_restricted_units} restricted / {data.total_units} total
                </div>
              </div>
              {data.expiration_date && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide font-medium">Program Expiry</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{data.expiration_date}</div>
                </div>
              )}
              {data.owner_management && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide font-medium">Management</div>
                  <div className="font-semibold text-slate-800 mt-0.5 text-xs leading-tight">{data.owner_management}</div>
                </div>
              )}
            </div>

            {/* Contact */}
            {(data.phone || data.website) && (
              <div className="flex flex-wrap gap-2">
                {data.phone && (
                  <a
                    href={`tel:${data.phone}`}
                    className="flex items-center gap-1.5 text-sm text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    📞 {data.phone}
                  </a>
                )}
                {data.website && (
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    🌐 Visit website ↗
                  </a>
                )}
              </div>
            )}

            {/* Live unit listings */}
            {units.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  Available Units
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    {units.length} listing{units.length !== 1 ? 's' : ''}
                  </span>
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Size</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rent</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Available</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {units.map((u, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {UNIT_LABELS[u.unit_type] || u.unit_type}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {u.sqft ? `${u.sqft} sqft` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {u.rent_min
                              ? u.rent_min === u.rent_max
                                ? `$${u.rent_min.toLocaleString()}`
                                : `$${u.rent_min.toLocaleString()}–$${u.rent_max.toLocaleString()}`
                              : <span className="text-xs font-medium text-blue-600">Contact for Pricing</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <AvailBadge unit={u} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.units.some((u) => u.source_url) && (
                  <p className="text-xs text-slate-400 mt-2">
                    Data scraped from property website · may not reflect current availability
                  </p>
                )}
              </div>
            )}

            {/* No live listings message */}
            {units.length === 0 && (
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500 text-center">
                No live pricing data available.
                {data.website && (
                  <span>
                    {' '}
                    <a href={data.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
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
                <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2 flex-wrap">
                  Affordable Unit Qualification
                  {data.affordable?.total_mfte_units > 0 && (
                    <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {data.affordable.total_mfte_units} MFTE
                    </span>
                  )}
                  {data.affordable?.total_iz_units > 0 && (
                    <span className="bg-violet-100 text-violet-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {data.affordable.total_iz_units} IZ
                    </span>
                  )}
                  {data.affordable?.total_mha_units > 0 && (
                    <span className="bg-teal-100 text-teal-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {data.affordable.total_mha_units} MHA
                    </span>
                  )}
                </h3>
                {data.pageInfo?.has_waitlist_mention === 1 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    ⏳ This property's website mentions a waitlist.
                    {data.pageInfo.info_url && (
                      <>
                        {' '}
                        <a
                          href={data.pageInfo.info_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-amber-900"
                        >
                          See details ↗
                        </a>
                      </>
                    )}
                  </p>
                )}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Program</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">AMI</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Max Rent</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Max Income (1p / 2p)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.qualifications.map((q, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-medium text-slate-800">{q.bedroom}</td>
                          <td className="px-3 py-2.5 text-slate-500">{q.program}</td>
                          <td className="px-3 py-2.5 text-right text-slate-500">{q.ami_pct}%</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                            {q.max_rent ? `$${q.max_rent.toLocaleString()}/mo` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-500 text-xs">
                            {q.income_limit_1
                              ? `$${q.income_limit_1.toLocaleString()} / $${q.income_limit_2?.toLocaleString() ?? '—'}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 mt-2">
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
    </div>
  )
}
