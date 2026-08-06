/**
 * Street-address normalization, mirroring addresses.py.
 *
 * Used to resolve a shared list back to current properties. Both sides of that
 * comparison — the addresses carried in a link and the addresses in the
 * database — are normalized here, by this one function, so the match only ever
 * depends on itself. That is the point: property ids for scraped buildings are
 * derived from an address key, so they change whenever that derivation changes,
 * whereas a raw address re-normalized at lookup time does not.
 */

const STREET_TYPE_CANON = {
  st: 'st', street: 'st',
  ave: 'ave', av: 'ave', avenue: 'ave',
  rd: 'rd', road: 'rd',
  blvd: 'blvd', boulevard: 'blvd',
  dr: 'dr', drive: 'dr',
  ln: 'ln', lane: 'ln',
  pl: 'pl', place: 'pl',
  ct: 'ct', court: 'ct',
  cir: 'cir', circle: 'cir',
  ter: 'ter', terrace: 'ter',
  pkwy: 'pkwy', parkway: 'pkwy',
  hwy: 'hwy', highway: 'hwy',
  way: 'way', wy: 'way',
  trl: 'trl', trail: 'trl',
  sq: 'sq', square: 'sq',
  loop: 'loop',
}

const DIRECTIONALS = {
  n: 'n', s: 's', e: 'e', w: 'w',
  ne: 'ne', nw: 'nw', se: 'se', sw: 'sw',
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
}

function tokens(street) {
  return street.replace(/\./g, ' ').trim().split(/[\s,]+/).filter(Boolean)
}

/** Keep through the last street type plus a trailing directional, else null. */
function truncateAtStreetType(list) {
  let last = null
  list.forEach((t, i) => {
    if (STREET_TYPE_CANON[t.toLowerCase().replace(/^[#-]+|[#-]+$/g, '')]) last = i
  })
  if (last === null) return null
  let end = last + 1
  if (end < list.length && DIRECTIONALS[list[end].toLowerCase().replace(/^[#-]+|[#-]+$/g, '')]) {
    end += 1
  }
  return list.slice(0, end)
}

export function cleanStreet(address) {
  let street = (address || '').split(',')[0]
  const truncated = truncateAtStreetType(tokens(street))
  if (truncated) return truncated.join(' ')

  street = street.replace(/\s*[-–]\s*(?=[\w/-]*\d)[\w/-]+\s*$/, '')
  street = street.replace(/(?:\b(?:apt|unit|ste|suite|bldg)\b|#)\s*[\w-]+\s*$/i, '')
  return street.replace(/\s{2,}/g, ' ').replace(/^[\s,\-#]+|[\s,\-#]+$/g, '')
}

export function normalizeStreetForKey(street) {
  return tokens((street || '').toLowerCase())
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .map((t) => STREET_TYPE_CANON[t] || DIRECTIONALS[t] || t)
    .join(' ')
}

function cityFromAddress(address) {
  const m = /,\s*([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})\b/.exec(address || '')
  return m ? m[1].trim() : ''
}

/** Cross-source identity for a building: normalized street plus city. */
export function addressKey(address, city) {
  const resolved = (city || cityFromAddress(address) || '').trim().toLowerCase()
  return `${normalizeStreetForKey(cleanStreet(address))}|${resolved}`
}
