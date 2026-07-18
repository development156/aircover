import type { Metadata } from 'next'
import { JetBrains_Mono, Outfit } from 'next/font/google'
// CLERK SLOT (step 3): import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' })
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Sahoda', template: '%s · Sahoda' },
  description: 'AI Marketing OS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // CLERK SLOT (step 3): wrap <html> in <ClerkProvider appearance={clerkAppearance}>
    <html lang="en" className={`${outfit.variable} ${jbMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
