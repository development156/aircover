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
   * THE ANDROID HALF OF "IT WORKS ON A HOME SCREEN".
   *
   * iOS reads `app/apple-icon.png` and nothing else. Chrome on Android reads a
   * web manifest, and with none it falls back to whatever `rel="icon"` it can
   * find and scales it, which is how a 16px tab icon becomes a blurry tile.
   *
   * It is a STATIC file rather than an `app/manifest.ts` route, and that is a
   * measurement: the route convention adds `/manifest.webmanifest/route` to the
   * build, and `scripts/perf/js-budget.mjs` correctly refuses a route it has no
   * budget for. Recording a 590 kB budget line for a document that ships no
   * client JavaScript would put a number in that file which means nothing and
   * which somebody would later have to explain. A file in `public/` has no route
   * and no budget line.
   *
   * What the manifest deliberately OMITS is `display` and `theme_color`. Chrome
   * needs `display: standalone` before it offers to install a site, and this
   * change was asked to fix an icon rather than to turn the product into an
   * installable app. Icons on a home screen work without it.
   */
  manifest: '/site.webmanifest',
  /**
   * ── NO `icons` HERE, AND THAT IS THE FIX ───────────────────────────────────
   *
   * This used to declare two PNGs qualified by `prefers-color-scheme`, pointing
   * at `/brand/favicon-dark.png` and `/brand/favicon-white.png`. Every part of
   * that was wrong once the real brand element was available:
   *
   *   - Both files are 594x508. A tab strip, a bookmark row, a pinned tab and a
   *     home-screen tile all draw into a SQUARE, so all four were squashing the
   *     mark by 15%, and each was a browser's own downscale of a 594px image at
   *     the 16px it is actually read at.
   *   - Neither file is the brand mark. They are black-and-white silhouettes;
   *     `public/LOGOS/element.png` is the Sahoda element in the brand orange.
   *   - There was no Apple touch icon at all, so an iPhone home screen fell back
   *     to a snapshot of the page.
   *
   * The icons are now FILE CONVENTIONS — `app/favicon.ico`, `app/icon.png` and
   * `app/apple-icon.png`. Next reads their real pixel dimensions, writes the
   * `sizes` and `type` attributes itself and fingerprints the URLs, so the
   * declaration cannot drift from the bytes. That is the whole reason this key
   * is gone rather than rewritten: a `metadata.icons` array ALSO emits link
   * tags, and two declarations of the same icon is how the dark variant would
   * quietly win over the light one again. One source, and it is the files.
   *
   * Regenerate every size from the artwork with `node scripts/gen-favicons.mjs`.
   * `favicon-assets.test.ts` fails if an output goes missing or stops being
   * square; `layout.test.tsx` fails if this key comes back.
   */
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
