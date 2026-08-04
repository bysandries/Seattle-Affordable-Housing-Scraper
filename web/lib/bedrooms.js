/**
 * The two datasets spell bedroom counts differently — the Seattle Office of
 * Housing layer uses "1-Bedroom", while the AppFolio scraper stores its
 * normalized unit types as "1br" — so a bedroom filter has to match either or
 * it silently drops every statewide property.
 *
 * Lives in its own module because both the server query (lib/db.js) and the
 * client-side map mirror (app/page.js) need it, and lib/db.js cannot be
 * imported from a client component.
 */
export const BEDROOM_ALIASES = {
  Micro: ['micro'],
  Studio: ['studio'],
  '1-Bedroom': ['1-bedroom', '1br'],
  '2-Bedroom': ['2-bedroom', '2br'],
  '3-Bedroom': ['3-bedroom', '3br'],
}

/** Match forms for a filter value, falling back to the value itself. */
export function bedroomAliases(value) {
  return BEDROOM_ALIASES[value] ?? [String(value).toLowerCase()]
}
