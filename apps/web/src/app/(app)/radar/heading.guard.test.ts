import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RADAR_H1 } from '../../../../e2e/helpers/headings'

/**
 * THE HEADING ON THE SCREEN AND THE HEADING THE SPECS LOOK FOR, HELD TOGETHER.
 *
 * ── WHAT WENT WRONG, AND WHY THE FIX WAS NOT ENOUGH ──────────────────────────
 * `/radar`'s `h1` was changed from the noun "Radar" to a sentence. Four
 * assertions across three specs pinned the noun, one of them in the @smoke set
 * that guards every release. The rename went red nowhere: the smoke leg has no
 * working environment in this repository (root CLAUDE.md), so it would have
 * failed on the way to customers rather than here.
 *
 * `e2e/helpers/headings.ts` was the answer to that, and it is a real improvement
 * — the literal went from four places to two, and the three specs now share one
 * export. But its own header claims renaming the heading "is now a one-line
 * change here", and that is not true: the sentence still lives in the page as
 * well, so a rename needs two edits and forgetting the second one is the exact
 * failure it was written to prevent. MEASURED 2026-09-01, `grep` finds it in
 * `radar/page.tsx:106` and `e2e/helpers/headings.ts:30`.
 *
 * ── WHY A UNIT TEST AND NOT A SHARED CONSTANT ────────────────────────────────
 * Making the page import the string from the e2e helper would ship test code
 * into the bundle; making the helper import from `@/…` depends on module
 * resolution inside Playwright's runner, which CANNOT BE VERIFIED HERE — the
 * suite does not run in this sandbox, so a change to it is a change nobody can
 * watch pass. An unverifiable fix to a guard is how this defect happened in the
 * first place.
 *
 * So the two copies stay and this holds them equal, in the leg that does run. A
 * rename that forgets the helper now fails in `pnpm gate`, seconds later,
 * instead of in production.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * It reads the page as TEXT, so it sees the literal in the JSX and nothing else:
 * a heading assembled from a variable, an interpolation, or a component would
 * read as absent and this would fail loudly rather than certify silently —
 * deliberate, but it means the remedy for that case is to rewrite this guard,
 * not to delete it. It says nothing about whether the element is really an `h1`,
 * whether it renders at all, or whether any OTHER screen's heading matches its
 * specs; `every-section-loads.spec.ts` is what covers those, and it is the thing
 * that cannot run here.
 */

const PAGE = resolve(import.meta.dirname, 'page.tsx')

/**
 * The `h1`'s text, as the file actually spells it.
 *
 * The capture group is read through a local rather than a `!` assertion because
 * `noUncheckedIndexedAccess` is on: a missing group would otherwise become a
 * `TypeError` at `.trim()`, and an accidental crash is not a failing guard. It
 * throws a sentence instead, naming what to do.
 */
function headingInPage(): string {
  const source = readFileSync(PAGE, 'utf8')
  const text = source.match(/<h1[^>]*>([^<{]+)<\/h1>/)?.[1]
  if (text === undefined) {
    throw new Error(
      'no plain-text <h1> found in radar/page.tsx — if the heading is now built ' +
        'from a variable or a component, rewrite this guard rather than removing it',
    )
  }
  return text.trim()
}

describe('the radar heading the specs pin', () => {
  it('is the heading the page actually renders', () => {
    expect(
      RADAR_H1.test(headingInPage()),
      `radar/page.tsx renders "${headingInPage()}" but e2e/helpers/headings.ts ` +
        `pins ${RADAR_H1}. Change both, or the smoke suite fails on the way to ` +
        `customers where nobody can run it.`,
    ).toBe(true)
  })

  it('is pinned by an ANCHORED pattern, so a longer heading cannot satisfy it', () => {
    // Playwright's `name` option matches a substring by default. An unanchored
    // pattern keeps passing against a heading that merely CONTAINS the words,
    // which is the guard going soft rather than going red.
    expect(RADAR_H1.source.startsWith('^')).toBe(true)
    expect(RADAR_H1.source.endsWith('$')).toBe(true)
    expect(RADAR_H1.test(`${headingInPage()} and more`)).toBe(false)
  })

  it('is a sentence, which is the decision this pair exists to record', () => {
    // The noun "Radar" is still on the screen, as the eyebrow above the heading.
    // If the h1 ever goes back to being the section name, this pair of files is
    // no longer needed and should be removed rather than left half-true.
    expect(headingInPage()).not.toBe('Radar')
  })
})
