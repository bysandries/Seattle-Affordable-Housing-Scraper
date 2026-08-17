import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="overflow-y-auto h-full w-full bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12 text-slate-800">
        <Link href="/" className="text-blue-600 hover:underline mb-6 inline-block">← Back to Map</Link>
      <h1 className="text-3xl font-bold mb-6 text-slate-900">Privacy Policy</h1>
      
      <div className="space-y-6 leading-relaxed">
        <p><strong>Last Updated: August 17, 2026</strong></p>
        
        <p>
          This Privacy Policy explains how we collect, use, and disclose information about you when you access or use our website. 
          As an educational and research project, we prioritize your privacy and minimize data collection.
        </p>
        
        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">1. Information We Collect</h2>
        <p>
          We do not require you to create an account or provide any personal information to use this website.
          We may automatically collect basic, non-identifying information such as your IP address, browser type, and operating system for server logging and security purposes, as is standard for internet hosting platforms like Vercel.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">2. How We Use Information</h2>
        <p>
          Any automatically collected server data is used exclusively to maintain the security, reliability, and performance of the website. We do not use your data for advertising, profiling, or tracking across other websites.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">3. Analytics — No Cookies, No Consent Banner Needed</h2>
        <p>
          To understand how the site is used and what to improve, we use <strong>Vercel Web Analytics</strong> and <strong>Vercel Speed Insights</strong>.
          These tools are <strong>cookieless</strong>: they set no cookies, store no identifiers on your device, do not fingerprint you, and cannot follow you
          across other websites. Visits are counted in aggregate only (for example: page views, country-level region, browser type, and page performance timings),
          and any temporary identifier is discarded so individual visitors cannot be re-identified. Because no cookies or similar tracking identifiers are used,
          EU ePrivacy and GDPR rules do not require a cookie consent banner for this measurement.
        </p>
        <p>
          We also record a small number of anonymous product events (such as &ldquo;a search was performed&rdquo;, &ldquo;a property was opened&rdquo;, or
          &ldquo;photos were enlarged&rdquo;). These events never include what you typed, which property you viewed, your saved lists, or anything else that
          could identify you — only that the feature was used.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">4. Local Storage (Your Saved Lists and Theme)</h2>
        <p>
          Your saved favorites and your light/dark theme choice are stored only in your own browser&rsquo;s local storage, at your request, so the site works
          without an account. This data never leaves your device unless you explicitly create a share link — and even then, the list travels inside the link
          itself rather than being stored on a server. Functional storage of this kind does not require consent under EU ePrivacy rules because it is strictly
          necessary for a feature you asked for. Clearing your browser data removes it completely.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">5. Data Sourcing</h2>
        <p>
          The property data (rent prices, availability, locations) displayed on this website is indexed from public web sources and the City of Seattle's open data portals, in the same way a search engine indexes public pages. We do not collect, index, or display any personal data regarding tenants or prospective renters.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">6. Third-Party Links</h2>
        <p>
          This website contains links to third-party property management and leasing websites. We are not responsible for the privacy practices or the content of those third-party sites. We encourage you to review the privacy policies of those websites before submitting any personal information.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">7. Contact Us</h2>
        <p>
          Since this is a non-commercial educational project, there is no formal support or contact team.
        </p>
      </div>
    </div>
    </div>
  )
}
