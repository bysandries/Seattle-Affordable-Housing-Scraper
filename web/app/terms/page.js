import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="overflow-y-auto h-full w-full bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12 text-slate-800">
        <Link href="/" className="text-blue-600 hover:underline mb-6 inline-block">← Back to Map</Link>
      <h1 className="text-3xl font-bold mb-6 text-slate-900">Terms of Service</h1>
      
      <div className="space-y-6 leading-relaxed">
        <p><strong>Last Updated: {new Date().toLocaleDateString()}</strong></p>
        
        <p>
          By accessing or using this website, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the website.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">1. Educational and Research Use</h2>
        <p>
          This website and its associated search-engine indexing tools are provided <strong>strictly for educational and research purposes</strong>. The information provided is for general informational purposes only and does not constitute housing, legal, or financial advice.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">2. Disclaimer of Warranties</h2>
        <p>
          The materials on this website are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
        </p>
        <p>
          Further, we do not warrant or make any representations concerning the accuracy, likely results, or reliability of the use of the materials on this website or otherwise relating to such materials or on any sites linked to this site. 
          <strong>Property pricing, availability, and income limits (AMI) change frequently and without notice. You must verify all information directly with the respective property management companies.</strong>
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">3. Limitations of Liability</h2>
        <p>
          In no event shall the creators of this educational project or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on this website, even if we have been notified orally or in writing of the possibility of such damage.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">4. Revisions and Errata</h2>
        <p>
          The materials appearing on this website could include technical, typographical, or photographic errors. We do not warrant that any of the materials on the website are accurate, complete, or current. We may make changes to the materials contained on the website at any time without notice.
        </p>

        <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">5. Links</h2>
        <p>
          We have not reviewed all of the sites linked to this website and are not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by us of the site. Use of any such linked website is at the user's own risk.
        </p>
      </div>
    </div>
    </div>
  )
}
