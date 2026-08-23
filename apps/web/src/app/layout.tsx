import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'

import { ThemeAttributeGuard } from '@/components/shell/theme-attribute-guard'
import { RailScript } from '@/components/shell/rail-script'
import { ThemeScript } from '@/components/shell/theme-script'
import { clerkAppearance } from '@/lib/clerk-appearance'
// No env import here — validation is LAZY (first `env.X` access, i.e. the first
// data-touching request) so an env-less `next build` can collect page data.
// A side-effect import stopped meaning anything the moment the parse moved out
// of module scope; keeping it would only document a guard that no longer fires.
import './globals.css'

/**
 * Plus Jakarta Sans, VARIABLE axis. `weight` is deliberately omitted.
 *
 * ── WHY THE FAMILY CHANGED FROM INTER (v5) ───────────────────────────────────
 * The brief asked for the brand's own fonts. There is no `brand/fonts/` — the
 * supplied assets are a logo lockup, a mascot, platform icons and a brandbook
 * PDF whose text layer is empty (49 pages, `pdftotext` yields 49 bytes), so
 * there is no font file and no named face to honour. The choice therefore had
 * to be made and justified rather than inherited.
 *
 * The wordmark is a PNG lockup, not a type specimen, so it does not oblige the
 * UI family — but it does describe the brand's letterforms, and they are
 * geometric with a double-story `a` and circular bowls. That rules Poppins out
 * (single-story `a`) and it rules Inter out too: Inter is a neo-grotesque with
 * a tall x-height and closed apertures, and it reads as the default UI face of
 * the last five years rather than as this brand.
 *
 * Plus Jakarta Sans is the closest available match to the wordmark's geometry
 * and to the reference's roundness, and it clears the three constraints that
 * actually bind:
 *
 *   1. VARIABLE AXIS 200-800. The scale leans on 550 and 650 to separate a
 *      label from its value with a half-step instead of jumping to bold, and
 *      neither exists as a static instance. Passing `weight: [...]` would ship
 *      fixed cuts, silently round 550 -> 500 and 650 -> 600, and flatten the
 *      hierarchy on every screen. Omitting `weight` emits the full axis.
 *   2. TABULAR FIGURES. `.num` sets `tnum`; a marketing OS may not let digits
 *      shuffle when a value updates. Outfit was rejected here — it is the
 *      closer geometric match and has no reliable tabular set.
 *   3. INDIC FALLBACK. It carries no Devanagari, exactly as Inter carried none,
 *      so `'Noto Sans Devanagari'` stays in the stack in tokens.css.
 *
 * The CSS variable keeps its `--font-inter` name on purpose: globals.css binds
 * `--sans` to it and renaming would be a rename with no reader, in a file whose
 * whole contract is that names stay stable while values move.
 */
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

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
          data-theme — and RailScript `data-rail` — onto this exact element
          before React hydrates, so the server's markup and the client's DOM
          differ by those attributes by design. It suppresses the warning for
          <html>'s own attributes only, not for any subtree. */}
      <html lang="en" className={sans.variable} suppressHydrationWarning>
        <head>
          <ThemeScript />
          {/* The rail's collapsed/expanded state, before first paint. Only the
              non-default (`expanded`) is ever written, so a document rendered
              with no JavaScript gets the founder's default rather than a rail
              that opens wide and then shuts. */}
          <RailScript />
        </head>
        <body>
          {/* Puts `data-theme` back when React re-renders <html> instead of
              hydrating it, which is what the root not-found boundary does —
              MEASURED: the 404 was light-only in a dark session while
              localStorage said 'dark'. See the component. */}
          <ThemeAttributeGuard />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
