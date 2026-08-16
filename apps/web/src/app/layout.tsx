import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import { clerkAppearance } from '@/lib/clerk-appearance'
// No env import here — validation is LAZY (first `env.X` access, i.e. the first
// data-touching request) so an env-less `next build` can collect page data.
// A side-effect import stopped meaning anything the moment the parse moved out
// of module scope; keeping it would only document a guard that no longer fires.
import './globals.css'

/**
 * Inter, VARIABLE axis. `weight` is deliberately omitted.
 *
 * The kit leans on 550 and 650 to separate a label from its value with a
 * half-step instead of jumping to bold, and neither exists as a static
 * instance. Passing `weight: ['400','500','600','700']` would ship four fixed
 * cuts, silently round 550 -> 500 and 650 -> 600, and flatten the type
 * hierarchy across every screen (RETHEME.md §2). Omitting `weight` is what
 * makes next/font emit the variable font with the full axis.
 *
 * There is no second family: the kit ships no mono, so tokens.css aliases
 * --mono to --sans. Inter carries tabular figures, which is all the three
 * former mono sites (credit pill, Credits balance, eyebrows) actually needed.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Sahoda', template: '%s · Sahoda' },
  description: 'AI Marketing OS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance} signInUrl="/sign-in" signUpUrl="/sign-up">
      <html lang="en" className={inter.variable}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
