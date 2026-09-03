import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A REMEDY THAT SCROLLS NOWHERE IS A REMEDY THAT CANNOT WORK.
 *
 * `lib/loop/eligibility.ts` answers "why will the Loop not plan this week" with a
 * sentence and somewhere to go. Two of those destinations are anchors on the
 * Loop page itself — `#loop-controls` for "Turn the Loop on" and `#loop-current`
 * for "Review this week" — and the sentences depend on them: *"its sentence says
 * 'open it' and the thing to open is further down the same page — a link to
 * nowhere would make that sentence false"*, in that file's own words.
 *
 * ── WHY THIS EXISTS, AND WHY NOTHING ELSE CATCHES IT ─────────────────────────
 * MEASURED 2026-08-29: the /loop redraw deleted `id="loop-current"` while
 * `eligibility.ts` still linked to it. `verdict.test.ts` stayed green, because it
 * asserts the href STRING. `no-impossible-remedy.spec.ts` stayed green, because
 * it is a text detector — it reads rendered copy for retry-words and never
 * resolves an anchor. `tsc` cannot see inside a string. So the one defect the
 * whole eligibility feature exists to prevent had no guard at all, and it was a
 * design change, not a logic change, that introduced it.
 *
 * This reads the source rather than a rendered page because the page is a server
 * component behind a workspace read: rendering it needs a database, and a guard
 * that only runs where a database is reachable is a guard that does not run.
 *
 * ── WHAT THIS CANNOT SEE, since it is subject to the same rule ───────────────
 *  · whether the element carrying the id is the thing the LABEL names. An id on
 *    the wrong element still resolves. (That happened too: `#loop-controls` is
 *    labelled "Turn the Loop on", and the button by that name moved out of the
 *    controls panel into the header, so the id moved with it — by hand, not
 *    because this noticed.)
 *  · a destination rendered conditionally. `#loop-current` only exists while a
 *    cycle does, which is exactly when `already_planned` is the verdict, but
 *    this checks that the id is WRITTEN, not that it is on screen.
 *  · any anchor built by interpolation rather than written as a literal.
 */

const LOOP_DIR = resolve(import.meta.dirname, '..', '..')
const SOURCES = [
  resolve(LOOP_DIR, 'app/(app)/loop/page.tsx'),
  ...readdirSync(resolve(LOOP_DIR, 'components/loop'))
    .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
    .map((f) => resolve(LOOP_DIR, 'components/loop', f)),
]

function anchorsOffered(): string[] {
  const src = readFileSync(resolve(import.meta.dirname, 'eligibility.ts'), 'utf8')
  return [...src.matchAll(/href:\s*'#([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]!)
}

function idsRendered(): Set<string> {
  const ids = new Set<string>()
  for (const file of SOURCES) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/\bid="([a-zA-Z0-9_-]+)"/g)) ids.add(m[1]!)
  }
  return ids
}

describe('every in-page remedy the Loop offers has somewhere to land', () => {
  it('offers at least one, so a passing run means something', () => {
    // A regex that stopped matching would make this file green by finding
    // nothing to check — the failure mode every source-scanning guard has.
    expect(anchorsOffered().length).toBeGreaterThan(0)
  })

  it('renders an element for each anchor it links to', () => {
    const ids = idsRendered()
    const dead = anchorsOffered().filter((anchor) => !ids.has(anchor))
    expect(
      dead,
      'eligibility.ts links to page anchors nothing renders — the sentence beside each says to open something that is not there',
    ).toEqual([])
  })
})
