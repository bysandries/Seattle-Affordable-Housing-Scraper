import { track } from '@vercel/analytics'

/**
 * UX event tracking, privacy-first by construction:
 * - Cookieless (Vercel Web Analytics sets no cookies and builds no cross-site
 *   profile), so no consent banner is required under GDPR / the ePrivacy rules.
 * - Events carry only coarse, non-identifying properties. Never send the raw
 *   search text, addresses, or anything a person typed — only derived signals
 *   like "a place was recognized" or "photos were opened".
 * - Analytics must never break the app: failures are swallowed.
 */
export function trackEvent(name, props) {
  try {
    track(name, props)
  } catch {
    // Blocked by an extension or offline — the app carries on.
  }
}
