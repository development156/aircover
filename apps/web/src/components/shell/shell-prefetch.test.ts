import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * EVERY NAVIGATION LINK IN THE SHELL OPTS OUT OF VIEWPORT PREFETCH.
 *
 * MEASURED 2026-09-06 on the wt-core preview: within 0.5s of landing on /home,
 * the browser fired 20 `?_rsc=` requests — one per rail, bottom-bar and topbar
 * link — and Vercel's function log showed the same 20 routes executing, each
 * a full server render of an authenticated layout with its reads. Twenty
 * renders per arrival, per user, before anything was clicked.
 *
 * `prefetch={false}` keeps the hover and focus prefetch (Next still warms a
 * route the pointer is over), which is the only prefetch a navigation rail
 * needs. This test reads the source because prefetch is not observable in
 * the rendered DOM: a `<Link>` without the prop looks identical to one with it.
 *
 * ── WHAT IT CANNOT SEE, STATED SO NOBODY READS SILENCE AS COVERAGE ──────────
 *  · It reads FOUR named files. A fifth shell surface, a link moved into a new
 *    component, or a nav rendered by something outside this list is invisible
 *    to it, and would prefetch twenty routes again with nothing going red.
 *  · The match is a regex over `<Link …>` TEXT. A link whose props are spread
 *    (`<Link {...props}>`), built by a wrapper component, or given the value
 *    through a variable rather than the literal `prefetch={false}` reads as a
 *    violation or as a pass depending only on how it was typed.
 *  · It cannot see a REQUEST. It asserts the prop is written, never that the
 *    browser stopped firing `?_rsc=` on sight — that was measured by hand in
 *    Vercel's function log and is not re-measured here.
 */
const SHELL = resolve(import.meta.dirname)
const FILES = ['nav-item.tsx', 'bottom-nav.tsx', 'more-sheet.tsx', 'rail.tsx']

describe('shell links do not prefetch on sight', () => {
  test.each(FILES)('%s', (file) => {
    const source = readFileSync(resolve(SHELL, file), 'utf8')
    const links = source.match(/<Link\b[^>]*>/gs) ?? []
    expect(links.length, `${file} has no <Link>`).toBeGreaterThan(0)
    for (const link of links) {
      expect(link, `a <Link> in ${file} prefetches on sight:\n${link}`).toMatch(
        /prefetch=\{false\}/,
      )
    }
  })
})
