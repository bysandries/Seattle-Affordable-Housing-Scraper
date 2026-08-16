'use client'

import { useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------ icons */

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M12 15c1.66 0 3-1.31 3-2.97V5.97C15 4.31 13.66 3 12 3S9 4.31 9 5.97v6.06C9 13.69 10.34 15 12 15z"
      />
      <path fill="#34a853" d="M11 18.08h2V21h-2z" />
      <path
        fill="#fbbc05"
        d="M7.05 16.87c-1.27-1.33-2.05-3.1-2.05-4.87h2c0 1.45.56 2.77 1.47 3.76l-1.42 1.11z"
      />
      <path
        fill="#ea4335"
        d="M12 16.93a4.97 4.97 0 0 1-3.54-1.46l-1.41 1.4C8.32 18.14 10.07 19 12 19s3.68-.86 4.95-2.13l-1.41-1.4A4.97 4.97 0 0 1 12 16.93zM17 12h2c0 1.77-.78 3.54-2.05 4.87l-1.42-1.11A5.5 5.5 0 0 0 17 12z"
      />
    </svg>
  )
}

function LensIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M5 8V6a2 2 0 0 1 2-2h2" stroke="#4285f4" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19 8V6a2 2 0 0 0-2-2h-2" stroke="#ea4335" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M5 16v2a2 2 0 0 0 2 2h2" stroke="#34a853" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19 16v2a2 2 0 0 1-2 2h-2" stroke="#fbbc05" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.4" fill="#4285f4" />
    </svg>
  )
}

function SearchGlyph({ className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  )
}

function AppsGridIcon() {
  const dots = []
  for (const y of [4, 11, 18]) for (const x of [4, 11, 18]) dots.push([x, y])
  return (
    <svg viewBox="0 0 22 22" width="18" height="18" fill="currentColor" aria-hidden="true">
      {dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" />
      ))}
    </svg>
  )
}

/* ----------------------------------------------------------------- pieces */

const LOGO_LETTERS = [
  ['G', '#4285f4'],
  ['o', '#ea4335'],
  ['o', '#fbbc05'],
  ['g', '#4285f4'],
  ['l', '#34a853'],
  ['e', '#ea4335'],
]

export function GoogleWordmark({ size = 'text-[26px]' }) {
  return (
    <span className={`font-display ${size} leading-none tracking-tight select-none whitespace-nowrap`}>
      {LOGO_LETTERS.map(([ch, color], i) => (
        <span key={i} style={{ color }}>
          {ch}
        </span>
      ))}
    </span>
  )
}

function ThemeToggle() {
  // Read the class the layout bootstrap script set; render a stable icon on
  // the server pass and swap after mount so hydration never mismatches.
  const [dark, setDark] = useState(null)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {}
    setDark(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label="Toggle theme"
      className="w-10 h-10 flex items-center justify-center rounded-full text-gink-secondary dark:text-gink-dark-secondary hover:bg-gsurface-chip dark:hover:bg-gsurface-dark-chip transition-colors"
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      )}
    </button>
  )
}

function SearchBox({ value, onSearch }) {
  // Debounced like the old FilterBar box: each applied keystroke refetches the
  // list AND re-filters every map marker, so the draft keeps typing snappy.
  const [draft, setDraft] = useState(value)
  const timer = useRef(null)

  useEffect(() => {
    setDraft(value)
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])

  const setSearch = (v) => {
    setDraft(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onSearch(v), 250)
  }

  const flush = () => {
    clearTimeout(timer.current)
    onSearch(draft)
  }

  return (
    <div className="flex items-center h-11 w-full rounded-full bg-white border border-gline shadow-none hover:shadow-pill focus-within:shadow-pill dark:bg-gsurface-dark-raised dark:border-transparent transition-shadow pl-5 pr-2">
      <input
        type="text"
        value={draft}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && flush()}
        placeholder='Try "rent in Seattle", a neighborhood, or an address…'
        aria-label="Search rentals"
        className="flex-1 min-w-0 bg-transparent text-base text-gink dark:text-gink-dark outline-none placeholder:text-gink-tertiary dark:placeholder:text-gink-dark-tertiary"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft('')
            clearTimeout(timer.current)
            onSearch('')
          }}
          aria-label="Clear search"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-gink-secondary dark:text-gink-dark-secondary hover:bg-gsurface-chip dark:hover:bg-gsurface-dark-chip"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
      <span className="w-px h-6 mx-1 bg-gline dark:bg-gsurface-dark-chip shrink-0" aria-hidden="true" />
      <span className="w-10 h-10 shrink-0 flex items-center justify-center" title="Voice search — decorative in this concept">
        <MicIcon />
      </span>
      <span className="w-10 h-10 shrink-0 flex items-center justify-center" title="Search by image — decorative in this concept">
        <LensIcon />
      </span>
      <button
        type="button"
        onClick={flush}
        aria-label="Search"
        className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-google-blue hover:bg-gsurface-chip dark:hover:bg-gsurface-dark-chip"
      >
        <SearchGlyph />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------- tabs */

// Every tab works: "Listings" and "Maps" are this concept's own views, while
// All / Images / News / Shopping embed the live google.com results for the
// query. Only "AI Mode" stays inert (it cannot render embedded).
const TABS = [
  { id: 'ai', label: 'AI Mode', inert: true },
  { id: 'all', label: 'All' },
  { id: 'listings', label: 'Listings' },
  { id: 'images', label: 'Images' },
  { id: 'maps', label: 'Maps' },
  { id: 'news', label: 'News' },
  { id: 'shopping', label: 'Shopping' },
]

export default function SearchHeader({
  search,
  onSearch,
  view, // 'listings' | 'map'
  onViewChange,
  toolsOpen,
  onToolsToggle,
  activeFilterCount,
  onClearAll,
}) {
  const activeTab = view === 'map' ? 'maps' : view

  const clickTab = (tab) => {
    if (tab.inert) return
    onViewChange(tab.id === 'maps' ? 'map' : tab.id)
  }

  return (
    <header className="shrink-0 z-20 bg-white dark:bg-gsurface-dark border-b border-gline dark:border-gline-dark">
      {/* Logo + search + account row */}
      <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 pt-4 pb-1">
        <a
          href="/"
          className="shrink-0 lg:w-[132px]"
          aria-label="Google Listings concept home"
          onClick={(e) => {
            e.preventDefault()
            onClearAll()
            onViewChange('listings')
          }}
        >
          <GoogleWordmark />
        </a>
        <div className="flex-1 max-w-[692px]">
          <SearchBox value={search} onSearch={onSearch} />
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <button
            type="button"
            title="Google apps — decorative in this concept"
            aria-label="Google apps"
            className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full text-gink-secondary dark:text-gink-dark-secondary hover:bg-gsurface-chip dark:hover:bg-gsurface-dark-chip transition-colors"
          >
            <AppsGridIcon />
          </button>
          <span
            className="w-8 h-8 rounded-full bg-google-blue text-white text-sm font-display flex items-center justify-center select-none"
            title="Signed in — decorative in this concept"
          >
            E
          </span>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center px-4 sm:px-6 lg:pl-[172px]">
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Search categories">
          {TABS.map((tab) => {
            const active = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => clickTab(tab)}
                title={tab.inert ? 'Part of the concept chrome' : undefined}
                aria-current={active ? 'page' : undefined}
                className={`relative shrink-0 px-3 pt-1.5 pb-2.5 text-[13px] transition-colors ${
                  active
                    ? 'text-google-blue-ink dark:text-google-link-dark font-medium'
                    : 'text-gink-secondary dark:text-gink-dark-tertiary hover:text-gink dark:hover:text-gink-dark'
                } ${tab.inert ? 'cursor-default' : ''}`}
              >
                {tab.label}
                {active && (
                  <span className="absolute left-3 right-3 bottom-0 h-[3px] rounded-t-full bg-google-blue-ink dark:bg-google-link-dark" />
                )}
              </button>
            )
          })}
        </nav>
        <button
          type="button"
          onClick={onToolsToggle}
          className={`ml-auto shrink-0 px-3 pt-1.5 pb-2.5 text-[13px] transition-colors flex items-center gap-1.5 ${
            toolsOpen || activeFilterCount > 0
              ? 'text-google-blue-ink dark:text-google-link-dark font-medium'
              : 'text-gink-secondary dark:text-gink-dark-tertiary hover:text-gink dark:hover:text-gink-dark'
          }`}
        >
          Tools
          {activeFilterCount > 0 && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[#e8f0fe] text-google-blue-deep dark:bg-[#1f3049] dark:text-google-link-dark">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
