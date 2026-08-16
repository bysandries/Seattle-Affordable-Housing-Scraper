/**
 * Turns a free-text query like "rent in seattle" into the keywords that
 * actually identify places and buildings. Shared by the server query
 * (lib/db.js) and the client-side map mirror so both always agree.
 */

// Filler vocabulary people naturally type into a housing search. None of these
// words distinguish one property from another, so they carry no constraint —
// "rent in seattle" must mean exactly what "seattle" means.
const STOPWORDS = new Set([
  'rent', 'rents', 'rental', 'rentals', 'rented', 'renting',
  'apartment', 'apartments', 'apt', 'apts',
  'housing', 'house', 'houses', 'home', 'homes', 'condo', 'condos',
  'unit', 'units', 'room', 'rooms', 'listing', 'listings',
  'property', 'properties', 'building', 'buildings',
  'in', 'near', 'nearby', 'around', 'at', 'on', 'by', 'to', 'of',
  'for', 'with', 'and', 'or', 'the', 'a', 'an', 'me', 'my',
  'cheap', 'affordable', 'available', 'now', 'new',
  'wa', 'washington', 'state', 'usa',
])

/**
 * Query → meaningful lowercase tokens. Single characters are dropped too:
 * they match half the dataset and constrain nothing.
 */
export function tokenizeQuery(query) {
  return (query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/**
 * AND across tokens, OR across fields: every keyword must appear somewhere,
 * but each may hit a different field ("broadway seattle" → name + city).
 * Substring rather than whole-word so partial input matches while typing.
 */
export function matchesTokens(tokens, fields) {
  return tokens.every((t) => fields.some((f) => (f || '').toLowerCase().includes(t)))
}

/**
 * The place a query names, if any — used to fly the map there. Matching is
 * word-prefix rather than substring so "lynn" finds Lynnwood but a stray "ent"
 * inside "Kent" never triggers a jump. Callers pass names in priority order
 * (cities before neighborhoods before counties); first hit wins.
 */
export function detectPlace(tokens, placeNames) {
  for (const name of placeNames) {
    const words = (name || '').toLowerCase().split(/[^a-z0-9]+/)
    if (tokens.some((t) => words.some((w) => w.startsWith(t)))) return name
  }
  return ''
}
