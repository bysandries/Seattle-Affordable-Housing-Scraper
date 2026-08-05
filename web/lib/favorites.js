'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const KEY = 'shs.favorites.v2'
const LEGACY_KEY = 'shs.favorites.v1'

const EMPTY = { properties: [], units: [] }

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

function read() {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        properties: Array.isArray(parsed?.properties)
          ? parsed.properties.map(Number).filter(Number.isFinite)
          : [],
        units: Array.isArray(parsed?.units)
          ? parsed.units.filter((u) => u && typeof u.key === 'string')
          : [],
      }
    }
    // Favorites saved before units could be hearted were bare property ids.
    const legacy = window.localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const ids = JSON.parse(legacy)
      if (Array.isArray(ids)) {
        return { properties: ids.map(Number).filter(Number.isFinite), units: [] }
      }
    }
    return EMPTY
  } catch {
    return EMPTY
  }
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

  const toggleProperty = useCallback((id) => {
    const numeric = Number(id)
    const cur = read()
    const next = {
      ...cur,
      properties: cur.properties.includes(numeric)
        ? cur.properties.filter((x) => x !== numeric)
        : [...cur.properties, numeric],
    }
    write(next)
    setState(next)
  }, [])

  const toggleUnit = useCallback((unit, propertyId) => {
    const key = unitKey(unit)
    if (!key) return
    const cur = read()
    const next = {
      ...cur,
      units: cur.units.some((u) => u.key === key)
        ? cur.units.filter((u) => u.key !== key)
        // propertyId is stored alongside so the list filter can resolve saved
        // units back to buildings without another round trip.
        : [...cur.units, { key, propertyId: Number(propertyId) }],
    }
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
    propertyIds,
    isPropertyFavorite,
    isUnitFavorite,
    toggleProperty,
    toggleUnit,
    savedUnitCount,
    count: state.properties.length + state.units.length,
  }
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
