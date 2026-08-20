import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * NO SCREEN MAY RENDER A FRACTION WHOSE DENOMINATOR DOES NOT EXIST.
 *
 * ── THE STRING, AND WHERE IT WAS STILL LIVE ──────────────────────────────────
 * docs/26 §4 names this by its literal shape: `100 of —` renders a numerator,
 * the word "of", and an absence mark. Read together they assert that a fraction
 * EXISTS and its denominator is merely unknown — a stronger and falser claim
 * than saying nothing. It is the reason the absence vocabulary deliberately has
 * NO class for "does not exist": you delete the slot.
 *
 * MEASURED in a real browser on 2026-08-20, the rail's foot rendered exactly
 * `100 of —` under the label "Credits left", on every page of the app. Its own
 * docstring argued the denominator out of existence — Sahoda's credits are a
 * balance, not a monthly allowance drawn down — correctly omitted the ratio BAR
 * for that reason, and then printed the words anyway. Reasoning the right way
 * to the right conclusion and shipping the opposite is what a mechanical check
 * is for.
 *
 * ── WHY THIS IS A SOURCE SCAN ────────────────────────────────────────────────
 * It survived a design audit that produced the doc quoting the string. Nobody
 * looks at the corner of the sidebar; the number there is small, correct, and
 * followed by two characters nobody reads. A rendered check would need a case
 * per screen. The pattern is narrow enough to grep and total enough to ban.
 *
 * ── WHAT IS AND IS NOT CAUGHT ────────────────────────────────────────────────
 * Caught: the word `of` immediately followed by an em dash or an en dash, in
 * markup — `of &mdash;`, `of —`, `of &ndash;`. Not caught, and correctly so: a
 * real denominator (`3 of 5`), or an absence mark standing alone, which is the
 * whole point of `.is-unmeasured` and `Unmeasured` / `Unreadable`.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

function repoRoot(): string {
  let dir = HERE
  for (let up = 0; up < 12; up += 1) {
    try {
      if (statSync(join(dir, 'packages')).isDirectory()) return dir
    } catch {
      // keep walking
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('could not locate the repo root from the test file')
}

const WEB_SRC = join(repoRoot(), 'apps/web/src')

/**
 * `of` followed by an absence mark.
 *
 * Case-insensitive and tolerant of the JSX entity forms, because `of &mdash;`
 * and `of —` render identically and only one of them is greppable by eye.
 */
const PHANTOM = /\bof\s*(?:&mdash;|&ndash;|—|–)/gi

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    // This file names the pattern in order to ban it.
    if (/phantom-denominator\.test\.ts$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

/**
 * Comments are stripped before scanning.
 *
 * `rail-foot.tsx` now explains at length what it used to print, and quoting the
 * banned string in the explanation must not fail the ban — otherwise the only
 * way to keep the guard green is to delete the reasoning that stops the defect
 * coming back.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('no phantom denominators', () => {
  test('no file renders "of" beside an absence mark', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(WEB_SRC)) {
      const matches = withoutComments(readFileSync(file, 'utf8')).match(PHANTOM)
      if (!matches) continue
      offenders.push(
        `${relative(join(repoRoot(), 'apps/web'), file).split('\\').join('/')} (${matches.join(' ')})`,
      )
    }

    expect(
      offenders,
      'These render a numerator, the word "of", and an absence mark — which claims a ' +
        'fraction exists whose denominator is merely unknown. docs/26 §4: if the quantity ' +
        'does not exist, delete the slot. Use the number on its own under its own label.',
    ).toEqual([])
  })
})
