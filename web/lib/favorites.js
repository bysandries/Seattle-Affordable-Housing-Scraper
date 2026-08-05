'use client'

import { useCallback, useEffect, useState } from 'react'

const KEY = 'shs.favorites.v1'

/** Read the saved set, tolerating absent/corrupt storage. */
function read() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : []
  } catch {
    return []
  }
}

/**
 * Liked properties, persisted in localStorage.
 *
 * There are no user accounts, so favorites are per-browser. The `storage` event
 * keeps other tabs in sync; a custom event does the same for other components
 * in this tab, since `storage` does not fire on the tab that wrote it.
 */
export function useFavorites() {
  const [ids, setIds] = useState([])

  // Populated after mount rather than in useState, so server and client render
  // the same empty set and hydration does not mismatch.
  useEffect(() => {
    setIds(read())
    const sync = () => setIds(read())
    window.addEventListener('storage', sync)
    window.addEventListener('shs:favorites', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('shs:favorites', sync)
    }
  }, [])

  const toggle = useCallback((id) => {
    const numeric = Number(id)
    const next = read().includes(numeric)
      ? read().filter((x) => x !== numeric)
      : [...read(), numeric]
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Private browsing or a full quota — keep the in-memory state usable.
    }
    setIds(next)
    window.dispatchEvent(new Event('shs:favorites'))
  }, [])

  const isFavorite = useCallback((id) => ids.includes(Number(id)), [ids])

  return { favorites: ids, isFavorite, toggle, count: ids.length }
}

/** Heart toggle. Stops propagation so it works inside a clickable card. */
export function HeartButton({ active, onToggle, className = '', size = 'md' }) {
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
      aria-label={active ? 'Remove from favorites' : 'Save to favorites'}
      title={active ? 'Remove from favorites' : 'Save to favorites'}
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
