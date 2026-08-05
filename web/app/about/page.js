import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="overflow-y-auto h-full w-full bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12 text-slate-800">
        <Link href="/" className="text-blue-600 hover:underline mb-6 inline-block">← Back to Map</Link>
      <h1 className="text-3xl font-bold mb-6 text-slate-900">About Washington Affordable Housing Finder</h1>
      
      <div className="space-y-6 leading-relaxed">
        <p>
          This project was created as an educational and research tool to better understand the affordable housing landscape across Washington State. Finding affordable housing—particularly units that are income-restricted (like LIHTC, MFTE and MHA units)—is notoriously difficult due to decentralized waitlists, hidden pricing, and outdated public databases.
        </p>
        
        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">How it works</h2>
        <p>
          We combine several public datasets: the City of Seattle's ArcGIS open data portal, the Washington State Housing Finance Commission's list of active tax-credit (LIHTC) properties covering all 39 counties, and HUD's Resource Locator for the coordinates behind them. Our system then automatically visits the public websites of property management companies to discover real-time availability and pricing information.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">Educational & Research Purposes Only</h2>
        <p>
          This website is built <strong>strictly for educational and research purposes</strong>. The information presented here is gathered automatically and may not be 100% accurate or up to date. Property management companies frequently change their pricing, fees, and availability without warning.
        </p>
        <p>
          We do not verify this data manually. You should <strong>always contact the property or leasing office directly</strong> to confirm actual rents, income restrictions (AMI limits), and unit availability before making any housing decisions.
        </p>
      </div>
    </div>
    </div>
  )
}
