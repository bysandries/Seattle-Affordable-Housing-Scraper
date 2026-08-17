'use client'

import { useEffect, useRef, useState } from 'react'
import { buildShareUrl } from '@/lib/favorites'
import { trackEvent } from '@/lib/analytics'

const POPOVER_WIDTH = 360

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
 *
 * Clicking always does both: the link is copied automatically AND shown in a
 * popover for manual copying — so the user can verify what was copied, and the
 * flow still works where the Clipboard API is blocked (insecure context,
 * denied permission).
 */
export default function ShareFavorites({ state, disabled }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false) // did the last copy attempt land?
  const [url, setUrl] = useState('')
  // Fixed-position coordinates: the chip lives in a horizontally scrolling
  // strip whose overflow clipping would swallow an absolutely-positioned child.
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const inputRef = useRef(null)

  // Close on Escape; outside clicks are handled by the scrim below, which
  // swallows them so dismissing never also activates whatever sits underneath.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Pre-select the link once the popover renders, so manual copy is ⌘C away.
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.select()
  }, [open, url])

  const tryCopy = async (link) => {
    try {
      await navigator.clipboard.writeText(link)
      return true
    } catch {
      // Clipboard API needs a secure context and permission; fall back to the
      // selection-based path before giving up.
      try {
        inputRef.current?.select()
        return document.execCommand('copy')
      } catch {
        return false
      }
    }
  }

  const share = async () => {
    const link = await buildShareUrl(state)
    setUrl(link)
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      setPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)),
        top: rect.bottom + 8,
      })
    }
    setOpen(true)
    // Clipboard API only here: the popover's input has not rendered yet, so
    // the selection-based fallback has nothing to select. If this is blocked,
    // the popover reports it and the Copy button takes the fallback path.
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      trackEvent('share_list', { auto_copied: true })
    } catch {
      setCopied(false)
      trackEvent('share_list', { auto_copied: false })
    }
  }

  const copyManually = async () => {
    inputRef.current?.select()
    setCopied(await tryCopy(url))
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={share}
        disabled={disabled}
        title={
          disabled
            ? 'Save some homes first, then share the list'
            : 'Copy a link to your saved list'
        }
        aria-label="Share favorites"
        aria-expanded={open}
        className={`shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] border transition-colors ${
          disabled
            ? 'bg-white text-gink-tertiary/50 border-gline cursor-not-allowed dark:bg-transparent dark:text-gink-dark-tertiary/50 dark:border-gline-dark'
            : open
            ? 'bg-[#e8f0fe] text-google-blue-deep border-transparent dark:bg-[#1f3049] dark:text-google-link-dark'
            : 'bg-white text-gink-secondary border-gline hover:bg-gsurface-dim dark:bg-transparent dark:text-gink-dark-secondary dark:border-gline-dark dark:hover:bg-gsurface-dark-chip/50'
        }`}
      >
        <ShareIcon />
        Share list
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1400]"
          aria-hidden="true"
          onMouseDown={() => setOpen(false)}
        />
      )}
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Share your saved list"
          style={{ left: pos.left, top: pos.top, width: POPOVER_WIDTH }}
          className="fixed z-[1500] rounded-2xl bg-white dark:bg-gsurface-dark-raised border border-gline dark:border-gline-dark shadow-2xl p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gink dark:text-gink-dark">
                Share your saved list
              </p>
              <p
                className={`text-xs mt-0.5 ${
                  copied
                    ? 'text-[#137333] dark:text-[#81c995]'
                    : 'text-[#b06000] dark:text-[#fdd663]'
                }`}
                role="status"
              >
                {copied
                  ? '✓ Link copied to clipboard — or copy it manually below.'
                  : 'Automatic copy was blocked — copy the link manually below.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="w-8 h-8 -mt-1 -mr-1 shrink-0 flex items-center justify-center rounded-full text-gink-secondary dark:text-gink-dark-secondary hover:bg-gsurface-chip dark:hover:bg-gsurface-dark-chip"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              ref={inputRef}
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              aria-label="Shareable link"
              className="flex-1 min-w-0 text-xs px-3 h-9 border border-gline dark:border-gline-dark rounded-full bg-gsurface-dim dark:bg-gsurface-dark-chip text-gink dark:text-gink-dark outline-none focus:border-google-blue-ink dark:focus:border-google-link-dark"
            />
            <button
              type="button"
              onClick={copyManually}
              className="shrink-0 h-9 px-4 rounded-full text-[13px] font-medium bg-google-blue-ink text-white hover:bg-google-blue-deep dark:bg-google-link-dark dark:text-[#202124] transition-colors"
            >
              Copy
            </button>
          </div>

          <p className="mt-2 text-[11px] text-gink-tertiary dark:text-gink-dark-tertiary">
            The list travels inside the link itself — nothing is stored on a server.
          </p>
        </div>
      )}
    </>
  )
}
