import './globals.css'
import { getLastIndexedAt } from '@/lib/db'

const TITLE = 'Google Listings Search Engine · a Google-style concept'
const DESCRIPTION =
  'Concept: what Google Search could look like with a "Listings" tab — a search engine for affordable housing across Washington State with real-time pricing and availability. Independent student project, not affiliated with Google.'

export const metadata = {
  // Absolute base for og:image / og:url when the link is shared.
  metadataBase: new URL('https://google-listings-search-engine.vercel.app'),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    siteName: 'Google Listings Search Engine',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

// Applied before paint so a dark-theme visitor never sees a white flash.
// Explicit choice wins; otherwise follow the OS preference.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`

export default async function RootLayout({ children }) {
  // The real crawl date from the bundled database — not today's date, which
  // would overstate how fresh the pricing is.
  let lastIndexed = null
  try {
    const at = await getLastIndexedAt()
    if (at) {
      lastIndexed = new Date(at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
  } catch {
    // A missing or older database just drops the date from the banner.
  }

  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full antialiased flex flex-col font-sans bg-white text-gink dark:bg-gsurface-dark dark:text-gink-dark">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <div className="bg-gsurface-dim dark:bg-gsurface-dark-raised text-gink-secondary dark:text-gink-dark-secondary border-b border-gline dark:border-gline-dark px-4 py-1.5 text-[11px] sm:text-xs text-center shrink-0 z-50">
          {/* Phones get the one-line version; the full disclaimer needs three. */}
          <span className="sm:hidden">
            Independent concept — not affiliated with Google.
          </span>
          <span className="hidden sm:inline">
            Independent design concept for educational research — not affiliated with or endorsed
            by Google. Always contact the property directly for current pricing and availability.
          </span>
          {lastIndexed && (
            <span className="whitespace-nowrap"> Data last indexed {lastIndexed}.</span>
          )}
        </div>
        <div className="flex-1 overflow-hidden h-full">
          {children}
        </div>
      </body>
    </html>
  )
}
