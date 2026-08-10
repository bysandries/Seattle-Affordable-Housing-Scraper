import './globals.css'

export const metadata = {
  title: 'Washington Affordable Housing Search Engine',
  description: 'A search engine for affordable housing across Washington State with real-time pricing and availability.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-50 antialiased flex flex-col">
        <div className="bg-amber-100 text-amber-900 px-4 py-2 text-xs sm:text-sm text-center shadow-sm shrink-0 z-50">
          <strong>Disclaimer:</strong> This website is for educational and research purposes only. Always contact the property or leasing office directly for current pricing and availability.
        </div>
        <div className="flex-1 overflow-hidden h-full">
          {children}
        </div>
      </body>
    </html>
  )
}
