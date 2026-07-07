import Link from 'next/link'

export default function DisclaimerPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-slate-800">
      <Link href="/" className="text-blue-600 hover:underline mb-6 inline-block">← Back to Map</Link>
      <h1 className="text-3xl font-bold mb-6 text-slate-900">Legal Disclaimer</h1>
      
      <div className="space-y-6 leading-relaxed">
        <p><strong>Last Updated: {new Date().toLocaleDateString()}</strong></p>
        
        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">For Educational & Research Purposes Only</h2>
        <p>
          This website, including its data collection systems and frontend interfaces, was created exclusively as a non-commercial educational and research project. Its primary purpose is to explore techniques in web data aggregation, automated ethical scraping, and geographical mapping.
        </p>
        
        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">No Affiliation</h2>
        <p>
          We are not affiliated, associated, authorized, endorsed by, or in any way officially connected with the City of Seattle, the Seattle Office of Housing, or any property management companies listed on this site. 
          All product and company names are trademarks™ or registered® trademarks of their respective holders. Use of them does not imply any affiliation with or endorsement by them.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">Accuracy of Information</h2>
        <p>
          The information on this website is aggregated from public sources, including the City of Seattle's ArcGIS open data portal and publicly accessible property listings. Because this data is collected via automated systems, it is highly subject to errors, omissions, formatting anomalies, and delays. 
        </p>
        <p>
          <strong>Do not rely on this information for critical housing or financial decisions.</strong> Prices, availability dates, and income restrictions change rapidly. You must independently verify all details by contacting the property or leasing office directly.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">Ethical Web Scraping</h2>
        <p>
          The automated tools backing this project are designed to follow ethical web scraping practices. They respect <code>robots.txt</code> files, enforce strict concurrency limits, and utilize generous request delays to prevent undue load on external servers. Furthermore, all automated form submission and contact functionalities have been strictly disabled to ensure compliance with anti-spam legislation and ethical guidelines.
        </p>
      </div>
    </div>
  )
}
