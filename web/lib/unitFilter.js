import { bedroomAliases } from '@/lib/bedrooms'

/**
 * Unit-level filters — the ones that describe a single apartment rather than a
 * whole building: bedroom type, max rent, available now.
 *
 * They have to be satisfied by ONE unit *together*. Matching them
 * independently advertised a $2,800 one-bedroom as a "1 Bed under $1,500"
 * whenever some other unit in the same building happened to be cheap.
 *
 * Shared by the SQL query (lib/db.js mirrors these predicates), the
 * client-side map mirror (app/page.js) and the details panel, so all three
 * always agree on what a filter means.
 */

export function hasUnitFilters(filters) {
  return !!(filters && (filters.bedroom || filters.maxRent > 0 || filters.availableNow))
}

/** Today as YYYY-MM-DD in local time — matches todayIso() in lib/db.js. */
function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * availability_status is frozen at scrape time, so a future date that has
 * since arrived would still read "future" — re-derive it against today.
 */
export function isAvailableNow(unit) {
  // Map rows carry the flag precomputed in SQL; unit rows carry the raw fields.
  if (unit.available_now != null) return !!Number(unit.available_now)
  if (unit.availability_status === 'now') return true
  return !!(unit.available_date && unit.available_date <= todayIso())
}

export function unitMatchesFilters(unit, filters) {
  if (!filters) return true
  if (filters.bedroom) {
    const type = String(unit.unit_type || '').toLowerCase()
    // "unknown" never matches: a bedroom filter promises every unit shown is
    // that bedroom count, and 2,394 live units carry no parsed type.
    if (!bedroomAliases(filters.bedroom).includes(type)) return false
  }
  if (filters.maxRent > 0 && !(unit.rent_min > 0 && unit.rent_min <= filters.maxRent)) {
    // Units published without a price cannot be shown as under budget; the SQL
    // join excludes them from the aggregates for the same reason.
    return false
  }
  if (filters.availableNow && !isAvailableNow(unit)) return false
  return true
}

/**
 * The map payload ships each property's live units as a compact string
 * ("1br:2800:1|unknown:995:0") so the client-side mirror can apply the same
 * per-unit rule without a round trip. Built by getMapProperties.
 */
export function parseUnitSummary(summary) {
  if (!summary) return []
  return summary.split('|').map((part) => {
    const [unit_type, rent, avail] = part.split(':')
    return {
      unit_type,
      rent_min: rent === '' ? null : Number(rent),
      available_now: avail === '1' ? 1 : 0,
    }
  })
}
