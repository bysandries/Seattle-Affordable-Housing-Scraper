import { ImageResponse } from 'next/og'

// The link-preview card shown when the site's URL is shared (iMessage, Slack,
// LinkedIn, X…). Generated at request time so it always matches the brand —
// no binary asset to keep in sync.

export const runtime = 'edge'
export const alt =
  'Google Listings Search Engine — a Google-style concept for affordable housing search in Washington State'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const LOGO = [
  ['G', '#4285f4'],
  ['o', '#ea4335'],
  ['o', '#fbbc05'],
  ['g', '#4285f4'],
  ['l', '#34a853'],
  ['e', '#ea4335'],
]

const TABS = ['All', 'Listings', 'Images', 'Maps', 'News']

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#202124',
          gap: 34,
        }}
      >
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: 104, fontWeight: 700 }}>
            {LOGO.map(([ch, color], i) => (
              <span key={i} style={{ color }}>
                {ch}
              </span>
            ))}
          </div>
          <span
            style={{
              color: '#9aa0a6',
              fontSize: 88,
              marginLeft: 26,
              marginBottom: 4,
            }}
          >
            Listings
          </span>
        </div>

        {/* Search pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: 720,
            height: 78,
            borderRadius: 39,
            background: '#303134',
            border: '1px solid #5f6368',
            padding: '0 34px',
          }}
        >
          <span style={{ fontSize: 32, color: '#e8eaed' }}>rent in seattle</span>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#8ab4f8" strokeWidth="2" />
            <path d="M16.5 16.5L21 21" stroke="#8ab4f8" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        {/* Tab strip with Listings active */}
        <div style={{ display: 'flex', gap: 42 }}>
          {TABS.map((t) => (
            <div
              key={t}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 27,
                  color: t === 'Listings' ? '#8ab4f8' : '#9aa0a6',
                }}
              >
                {t}
              </span>
              <div
                style={{
                  width: '100%',
                  height: 5,
                  borderRadius: 3,
                  background: t === 'Listings' ? '#8ab4f8' : 'transparent',
                }}
              />
            </div>
          ))}
        </div>

        <span style={{ fontSize: 30, color: '#bdc1c6', marginTop: 6 }}>
          Affordable-housing search for Washington State — live pricing, photos &amp; maps
        </span>
        <span style={{ fontSize: 21, color: '#80868b' }}>
          Independent design concept — not affiliated with Google
        </span>
      </div>
    ),
    { ...size }
  )
}
