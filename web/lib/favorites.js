'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { addressKey } from '@/lib/addresses'

const KEY = 'shs.favorites.v3'
const LEGACY_KEYS = ['shs.favorites.v2', 'shs.favorites.v1']

// `places` records the street address of every building referenced here, keyed
// by id. Ids for scraped buildings are derived from a normalized address, so
// they are reissued whenever that normalization changes; an address survives
// that and lets a shared link find the building again.
const EMPTY = { properties: [], units: [], places: {} }

/**
 * Stable identity for a unit.
 *
 * `units.id` is useless here: every scrape re-inserts rows with fresh
 * autoincrement ids, so a saved id would go stale within a day. AppFolio
 * listings carry a durable UUID in listing_url. Site-scraped rows have no such
 * link, so they fall back to the attributes that distinguish units within one
 * building — which means a favorite is dropped if that unit's rent changes.
 */
export function unitKey(unit) {
  if (!unit) return null
  if (unit.listing_url) return unit.listing_url
  return [
    'p',
    unit.property_id,
    unit.unit_type ?? '',
    unit.sqft ?? '',
    unit.rent_min ?? '',
  ].join(':')
}

function normalize(parsed) {
  return {
    properties: Array.isArray(parsed?.properties)
      ? parsed.properties.map(Number).filter(Number.isFinite)
      : [],
    units: Array.isArray(parsed?.units)
      ? parsed.units.filter((u) => u && typeof u.key === 'string')
      : [],
    places: parsed?.places && typeof parsed.places === 'object' ? parsed.places : {},
  }
}

function read() {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) return normalize(JSON.parse(raw))

    // Earlier shapes: v2 had properties/units but no addresses, v1 was a bare
    // array of property ids. Both upgrade cleanly, just without addresses —
    // those entries fall back to id-only matching, as they do today.
    for (const legacyKey of LEGACY_KEYS) {
      const legacy = window.localStorage.getItem(legacyKey)
      if (!legacy) continue
      const parsed = JSON.parse(legacy)
      if (Array.isArray(parsed)) {
        return { ...EMPTY, properties: parsed.map(Number).filter(Number.isFinite) }
      }
      return normalize(parsed)
    }
    return EMPTY
  } catch {
    return EMPTY
  }
}

function dropPlace(places, id) {
  const { [id]: _removed, ...rest } = places
  return rest
}

function write(next) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private browsing or a full quota — in-memory state still works.
  }
  window.dispatchEvent(new Event('shs:favorites'))
}

/**
 * Saved apartments and buildings, persisted per-browser in localStorage.
 *
 * Units are the granular case: you save the specific apartment you liked.
 * Buildings remain savable because 28% of properties publish no live listings
 * at all, so they would otherwise be impossible to keep track of.
 */
export function useFavorites() {
  const [state, setState] = useState(EMPTY)

  // Read after mount so server and client render the same empty set and
  // hydration does not mismatch.
  useEffect(() => {
    setState(read())
    const sync = () => setState(read())
    window.addEventListener('storage', sync)
    window.addEventListener('shs:favorites', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('shs:favorites', sync)
    }
  }, [])

  /** Record where a building is, so a shared link can find it again later. */
  const rememberPlace = (places, id, place) => {
    if (!place?.address) return places
    return { ...places, [id]: { a: place.address, c: place.city || '' } }
  }

  const toggleProperty = useCallback((id, place) => {
    const numeric = Number(id)
    const cur = read()
    const removing = cur.properties.includes(numeric)
    const properties = removing
      ? cur.properties.filter((x) => x !== numeric)
      : [...cur.properties, numeric]
    const stillReferenced = removing && cur.units.some((u) => u.propertyId === numeric)
    const places = removing
      ? (stillReferenced ? cur.places : dropPlace(cur.places, numeric))
      : rememberPlace(cur.places, numeric, place)
    const next = { ...cur, properties, places }
    write(next)
    setState(next)
  }, [])

  const toggleUnit = useCallback((unit, propertyId, place) => {
    const key = unitKey(unit)
    if (!key) return
    const numeric = Number(propertyId)
    const cur = read()
    const removing = cur.units.some((u) => u.key === key)
    const units = removing
      ? cur.units.filter((u) => u.key !== key)
      // propertyId is stored alongside so the list filter can resolve saved
      // units back to buildings without another round trip.
      : [...cur.units, { key, propertyId: numeric }]
    const stillReferenced =
      cur.properties.includes(numeric) || units.some((u) => u.propertyId === numeric)
    const places = removing
      ? (stillReferenced ? cur.places : dropPlace(cur.places, numeric))
      : rememberPlace(cur.places, numeric, place)
    const next = { ...cur, units, places }
    write(next)
    setState(next)
  }, [])

  const isPropertyFavorite = useCallback(
    (id) => state.properties.includes(Number(id)),
    [state.properties]
  )
  const isUnitFavorite = useCallback(
    (unit) => {
      const key = unitKey(unit)
      return key ? state.units.some((u) => u.key === key) : false
    },
    [state.units]
  )

  /** Buildings to show when filtering: saved outright, or holding a saved unit. */
  const propertyIds = useMemo(
    () => [...new Set([...state.properties, ...state.units.map((u) => u.propertyId)])],
    [state.properties, state.units]
  )

  /** How many saved units a given building holds, for the card badge. */
  const savedUnitCount = useCallback(
    (id) => state.units.filter((u) => u.propertyId === Number(id)).length,
    [state.units]
  )

  return {
    properties: state.properties,
    units: state.units,
    places: state.places,
    propertyIds,
    isPropertyFavorite,
    isUnitFavorite,
    toggleProperty,
    toggleUnit,
    savedUnitCount,
    count: state.properties.length + state.units.length,
  }
}

// ---------------------------------------------------------------------------
// Sharing
//
// The whole list travels in the URL, so a link works for anyone with no account
// and no server-side storage. Saved AppFolio units are identified by their
// listing URL, which is long and highly repetitive across a building, so the
// payload is deflated before encoding — that repetition is exactly what a
// compressor eats. Where CompressionStream is unavailable the JSON is encoded
// as-is; a one-character tag says which, so old links keep working.
// ---------------------------------------------------------------------------

const SHARE_PARAM = 's'
const TAG_DEFLATED = 'z'
const TAG_PLAIN = 'j'

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Encode a favorites state into the compact token that rides in the URL. */
export async function encodeShare({ properties = [], units = [], places = {} }) {
  const payload = JSON.stringify({
    v: 2,
    p: properties,
    u: units.map((u) => [u.propertyId, u.key]),
    // Addresses of every referenced building, so the link still resolves after
    // an id changes. Compresses well — they share street and city tokens.
    q: places,
  })
  const raw = new TextEncoder().encode(payload)
  const packed = await deflate(raw)
  return packed ? TAG_DEFLATED + bytesToBase64Url(packed) : TAG_PLAIN + bytesToBase64Url(raw)
}

/** Inverse of encodeShare. Returns null for anything malformed. */
export async function decodeShare(token) {
  if (!token || token.length < 2) return null
  try {
    const body = base64UrlToBytes(token.slice(1))
    const bytes = token[0] === TAG_DEFLATED ? await inflate(body) : body
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    return {
      properties: Array.isArray(parsed?.p) ? parsed.p.map(Number).filter(Number.isFinite) : [],
      units: Array.isArray(parsed?.u)
        ? parsed.u
            .filter((entry) => Array.isArray(entry) && typeof entry[1] === 'string')
            .map(([propertyId, key]) => ({ propertyId: Number(propertyId), key }))
        : [],
      // Absent in v1 links, which then fall back to id-only matching.
      places: parsed?.q && typeof parsed.q === 'object' ? parsed.q : {},
    }
  } catch {
    return null
  }
}

export async function buildShareUrl(state) {
  const token = await encodeShare(state)
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set(SHARE_PARAM, token)
  return url.toString()
}

/**
 * Re-point a shared list at whatever ids its buildings have now.
 *
 * Ids for scraped buildings are derived from a normalized address and change
 * when that normalization does, so a link made before such a change carries
 * dead ids. The addresses travel with it; this asks the server what they map to
 * today and rewrites the list. Entries with no address, or that genuinely no
 * longer exist, are left as they were.
 */
export async function resolveShared(list) {
  const entries = Object.entries(list.places || {})
  if (!entries.length) return list

  const keyed = entries.map(([id, place]) => ({
    oldId: Number(id),
    key: addressKey(place.a, place.c),
  }))

  let found = {}
  try {
    const res = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: [...new Set(keyed.map((k) => k.key))] }),
    })
    if (res.ok) found = await res.json()
  } catch {
    return list // Offline or server error: fall back to the ids as shared.
  }

  const remap = new Map()
  for (const { oldId, key } of keyed) {
    const current = found[key]
    if (current !== undefined && current !== oldId) remap.set(oldId, current)
  }
  if (!remap.size) return list

  const swap = (id) => remap.get(Number(id)) ?? Number(id)
  return {
    ...list,
    properties: [...new Set(list.properties.map(swap))],
    units: list.units.map((u) => ({ ...u, propertyId: swap(u.propertyId) })),
    places: Object.fromEntries(
      Object.entries(list.places).map(([id, place]) => [swap(id), place])
    ),
  }
}

export function readShareToken() {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(SHARE_PARAM)
}

/** Drop the share token from the address bar without reloading. */
export function clearShareToken() {
  const url = new URL(window.location.href)
  url.searchParams.delete(SHARE_PARAM)
  window.history.replaceState({}, '', url.pathname + url.search)
}

/** Merge a shared list into this browser's own favorites. */
export function importShared({ properties = [], units = [], places = {} }) {
  const cur = read()
  const keys = new Set(cur.units.map((u) => u.key))
  const next = {
    properties: [...new Set([...cur.properties, ...properties.map(Number)])],
    units: [...cur.units, ...units.filter((u) => !keys.has(u.key))],
    places: { ...cur.places, ...places },
  }
  write(next)
  return next
}

/** Heart toggle. Stops propagation so it works inside clickable rows and cards. */
export function HeartButton({ active, onToggle, className = '', size = 'md', label = 'favorites' }) {
  const px = size === 'sm' ? 'w-7 h-7 text-sm' : 'w-8 h-8 text-base'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onToggle()
      }}
      aria-pressed={active}
      aria-label={active ? `Remove from ${label}` : `Save to ${label}`}
      title={active ? `Remove from ${label}` : `Save to ${label}`}
      className={`${px} shrink-0 flex items-center justify-center rounded-full border transition-colors ${
        active
          ? 'bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100'
          : 'bg-white border-slate-200 text-slate-300 hover:text-rose-400 hover:border-rose-200'
      } ${className}`}
    >
      {active ? '♥' : '♡'}
    </button>
  )
}
