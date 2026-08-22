import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import { ThemeScript } from '@/components/shell/theme-script'
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
  /**
   * The tab strip is browser chrome — it follows the OS colour scheme, not our
   * in-app theme toggle, so this is `prefers-color-scheme` and never `data-theme`.
   * (docs/ui-package/sahoda-labs/SPECIFICATION.md, asset rules.)
   *
   * BOTH PNG entries carry a media query on purpose. The package says "media
   * variant first, plain one last as the Safari fallback", but an UNQUALIFIED
   * entry declared last is picked by last-wins browsers regardless of scheme,
   * which would silently kill the dark variant. The unqualified fallback is
   * `app/favicon.ico` instead: Next `unshift`s a file-based favicon onto the
   * front of this array (resolve-metadata.js), so it coexists with these two
   * rather than overriding them, and it is guaranteed to be first.
   *
   * Naming reads backwards at a glance: favicon-dark.png is the DARK-INK mark,
   * so it belongs on a light tab strip — which is exactly how bottom-nav.tsx
   * uses it (`dark:hidden`).
   *
   * No `apple` entry, deliberately. Both marks are 594x508, and iOS composites a
   * touch icon into a SQUARE — so pointing at either one hands Apple the exact
   * distortion the .ico is padded to 594x594 to avoid. Padding one properly needs
   * a background colour decision (transparent composites to black on iOS, which
   * would swallow the dark-ink mark), and there is no token that says which.
   * That is an owner call, not a defect fix; until then iOS falls back to its own
   * page snapshot rather than to a squashed logo.
   */
  icons: {
    icon: [
      { url: '/brand/favicon-dark.png', type: 'image/png', media: '(prefers-color-scheme: light)' },
      { url: '/brand/favicon-white.png', type: 'image/png', media: '(prefers-color-scheme: dark)' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance} signInUrl="/sign-in" signUpUrl="/sign-up">
      {/* suppressHydrationWarning is required and narrow: ThemeScript writes
          data-theme onto this exact element before React hydrates, so the
          server's markup and the client's DOM differ by that one attribute by
          design. It suppresses the warning for <html>'s own attributes only,
          not for any subtree. */}
      <html lang="en" className={inter.variable} suppressHydrationWarning>
        <head>
          <ThemeScript />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
