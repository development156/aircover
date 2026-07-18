import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { JetBrains_Mono, Outfit } from 'next/font/google'

import { clerkAppearance } from '@/lib/clerk-appearance'
// Side-effect import: env validation actually fails fast at boot — without a
// server-entrypoint import the guard never runs.
import '@/lib/env'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' })
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Sahoda', template: '%s · Sahoda' },
  description: 'AI Marketing OS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance} signInUrl="/sign-in" signUpUrl="/sign-up">
      <html lang="en" className={`${outfit.variable} ${jbMono.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
