'use client'

import { useEffect, useRef, useState } from 'react'
import { buildShareUrl } from '@/lib/favorites'

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
    </svg>
  )
}

/**
 * Copies a link that carries the saved list inside the URL itself, so a
 * recipient needs no account and nothing is stored server-side.
 */
export default function ShareFavorites({ state, disabled }) {
  const [status, setStatus] = useState('idle') // idle | copied | manual
  const [url, setUrl] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (status !== 'copied') return
    const t = setTimeout(() => setStatus('idle'), 2200)
    return () => clearTimeout(t)
  }, [status])

  // Select the fallback field once it renders, so the link is one keystroke away.
  useEffect(() => {
    if (status === 'manual' && inputRef.current) inputRef.current.select()
  }, [status])

  const share = async () => {
    const link = await buildShareUrl(state)
    setUrl(link)
    try {
      await navigator.clipboard.writeText(link)
      setStatus('copied')
    } catch {
      // Clipboard needs a secure context and permission; show the link instead
      // of failing silently.
      setStatus('manual')
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={share}
        disabled={disabled}
        title={
          disabled
            ? 'Save some homes first, then share the list'
            : 'Copy a link to your saved list'
        }
        aria-label="Share favorites"
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
          disabled
            ? 'bg-white text-slate-300 border-slate-200 cursor-not-allowed'
            : status === 'copied'
            ? 'bg-emerald-600 text-white border-emerald-600'
            : 'bg-white text-slate-600 border-slate-200 hover:border-rose-400 hover:text-rose-500'
        }`}
      >
        <ShareIcon />
        {status === 'copied' ? 'Link copied' : 'Share favorites'}
      </button>

      {status === 'manual' && (
        <span className="absolute top-full left-0 mt-1 z-50 flex items-center gap-1 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5">
          <input
            ref={inputRef}
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="w-56 text-xs px-2 py-1 border border-slate-200 rounded bg-slate-50"
          />
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="text-xs text-slate-400 hover:text-slate-700 px-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </span>
      )}
    </span>
  )
}
