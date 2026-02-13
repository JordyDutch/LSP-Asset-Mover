import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LSP Asset Mover - Transfer assets to your Universal Profile',
  description: 'Easily transfer your LSP7 and LSP8 assets from your legacy wallet to your LUKSO Universal Profile',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-white min-h-screen`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  )
}