import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * THERE IS ONE PAGE-HEADING SYSTEM, AND IT IS `PageTitle`.
 *
 * ── THE DEFECT, MEASURED 2026-08-29 ─────────────────────────────────────────
 * Sixty routes. Forty-two reached their heading through `PageTitle` (20px at
 * weight 650, with its description on the scale's own step). The admin console
 * ran a SECOND system beside it, in both branches of five screens:
 *
 *     text-[25px] leading-8 font-extrabold tracking-[-0.01em]   ×6   (3 screens)
 *     type-h2 font-extrabold                                    ×4   (2 screens)
 *
 * `page-title.tsx`'s own header argues against exactly the first of those —
 * "20px at weight 650, not 25px at 800… a page title that shouts makes every
 * screen below it feel like a landing page" — so the console was rendering the
 * treatment the primitive was written to replace, and had been since before the
 * primitive existed. Nothing failed, because nothing was looking.
 *
 * ── WHY A SOURCE SCAN AND NOT A RENDERED CHECK ──────────────────────────────
 * `every-section-loads.spec.ts` already asserts that each nav route renders AN
 * `<h1>` with the right words in it. That is the right check for "the screen
 * loaded and says what it is" and it is deliberately blind to which component
 * produced the heading — a hand-rolled `<h1>` satisfies it completely. It is
 * also a Playwright spec, so it cannot run in a sandbox with no browser, which
 * is the environment this repository has had for six sessions.
 *
 * So this guard asks the question that one cannot: does a second heading
 * treatment exist in the source at all. It runs in milliseconds, on every gate,
 * with no browser.
 *
 * ── WHAT IT DELIBERATELY DOES NOT ASSERT ────────────────────────────────────
 * Not "every page.tsx imports PageTitle". Eight routes legitimately do not have
 * one — the two Clerk auth screens, the two embed frames rendered inside someone
 * else's site, /design-system's own gallery display heading, the root redirect,
 * and /home, whose `GreetingBanner` replaces the title with a greeting on
 * purpose and says so in its own header. A guard that demanded the import would
 * have to carry an allowlist of those, and an allowlist is the thing that grows
 * quietly until it means nothing. Banning the SUPERSEDED TREATMENT needs no
 * allowlist, because there is no screen on which shouting is correct.
 */

const APP = resolve(import.meta.dirname, '..', 'app')

/** Every treatment `PageTitle` replaced. Each was live in the console. */
const SUPERSEDED: { pattern: RegExp; what: string }[] = [
  { pattern: /text-\[25px\][^"'`]*font-extrabold/, what: '25px/800 page heading' },
  { pattern: /font-extrabold[^"'`]*text-\[25px\]/, what: '25px/800 page heading' },
  { pattern: /<h1[^>]*type-h2[^>]*font-extrabold/, what: 'type-h2/800 page heading' },
  { pattern: /<h1[^>]*font-extrabold[^>]*type-h2/, what: 'type-h2/800 page heading' },
]

function pageFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...pageFiles(path))
    else if (entry.name === 'page.tsx') out.push(path)
  }
  return out
}

describe('one page-heading system', () => {
  const files = pageFiles(APP)

  it('finds the routes to check', () => {
    // If this ever reads 0 the scan below passes by looking at nothing, which is
    // the failure mode every source scan has and most do not guard.
    expect(files.length).toBeGreaterThan(50)
  })

  it('renders no superseded page-heading treatment on any route', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const { pattern, what } of SUPERSEDED) {
        if (pattern.test(source)) {
          offenders.push(`${file.slice(APP.length + 1)} — ${what}`)
        }
      }
    }

    // Named, not counted: a count tells the next reader that something is wrong
    // and a name tells them where. Sorted so the message is stable.
    expect(offenders.sort()).toEqual([])
  })

  it('gives the admin console the same heading as every other screen', () => {
    // The five screens the second system lived on. Listed by name rather than
    // globbed, because the point is that THESE were converted — a future admin
    // screen is covered by the scan above, not by this list.
    const converted = [
      'admin/applications/page.tsx',
      'admin/brain/page.tsx',
      'admin/credits/page.tsx',
      'admin/jobs/page.tsx',
      'admin/team/page.tsx',
    ]

    for (const route of converted) {
      const source = readFileSync(join(APP, route), 'utf8')
      expect(source, route).toContain('PageTitle')
    }
  })
})
