import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { JetBrains_Mono, Outfit } from 'next/font/google'

import { clerkAppearance } from '@/lib/clerk-appearance'
// No env import here — validation is LAZY (first `env.X` access, i.e. the first
// data-touching request) so an env-less `next build` can collect page data.
// A side-effect import stopped meaning anything the moment the parse moved out
// of module scope; keeping it would only document a guard that no longer fires.
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
