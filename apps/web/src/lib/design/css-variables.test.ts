import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * EVERY `var(--x)` IN THIS TREE MUST NAME A TOKEN THAT EXISTS.
 *
 * ── THE DEFECT THIS EXISTS FOR, WHICH SHIPPED SIX TIMES ─────────────────────
 * CSS does not error on an undefined custom property. `var(--accent)` where the
 * token is `--acc` is not a syntax error: the declaration becomes invalid at
 * computed-value time and the property silently falls back to its initial
 * value. The class name is spelled plausibly, it type-checks, it reads correctly
 * in review, and the element renders in the browser's default colour.
 *
 * MEASURED 2026-09-06, and every one of these was live:
 *
 *   `var(--accent)`   5 places. FOUR were `accent-[var(--accent)]` on real
 *                     checkboxes in the Loop and Remix flows, which therefore
 *                     rendered in the browser's default blue rather than the
 *                     brand orange they were written to be. The fifth was a ring.
 *   `var(--hairline)` 5 places, all `border-[var(--hairline)]`. Those borders
 *                     took `currentColor` instead of the hairline.
 *
 * `design-lint.mjs` cannot see these — it scans for raw hex, spacing literals,
 * dead breakpoints and hand-written font sizes, none of which this is.
 * `dead-classes.mjs` cannot either: it compares CLASS NAMES against compiled
 * CSS, and `border-[var(--hairline)]` is a class that compiles perfectly well
 * around a variable that does not exist.
 *
 * ── WHY THIS IS A UNIT TEST AND NOT A GATE SCRIPT ───────────────────────────
 * It needs no compiled stylesheet and no build: the question is only whether a
 * name referenced in one file is declared in another. That makes it fast enough
 * to run in the ordinary test leg, which is what "blocking" means here.
 */

const ROOT = join(process.cwd(), 'src')

/** The three stylesheets that declare tokens for this app. */
const SHEETS = [
  join(process.cwd(), '../../packages/shared/tokens.css'),
  join(ROOT, 'app/globals.css'),
  join(ROOT, 'styles/onboarding.css'),
]

/**
 * Set inline by the code that reads them, so they are declared on the element
 * rather than in a stylesheet. Each is listed with the file that sets it — an
 * entry here is a claim somebody can check, not a silencer.
 */
const SET_INLINE = new Set([
  // `components/motion/stagger.tsx` sets `--i` per row for the entrance delay.
  '--i',
  // Tailwind v4's own internal, written by the `font-*` utilities themselves.
  '--tw-font-weight',
])

/**
 * Comments out, and this file is the proof it is needed: written without it,
 * the guard failed on its OWN docblock, which names `var(--accent)` and
 * `var(--hairline)` to explain the defect it catches. A variable named in prose
 * is not a variable anybody reads. `dead-classes.mjs` strips comments before
 * scanning for the same reason.
 *
 * Block comments and line comments both. Deliberately NOT string-aware: a
 * `var(--x)` inside a template literal IS a reference — that is exactly how
 * `style={{ background: `var(--x)` }}` is written — so strings must survive.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

describe('every custom property a component reads is one a stylesheet declares', () => {
  it('finds no reference to a token that does not exist', () => {
    const declared = new Set<string>()
    for (const sheet of SHEETS) {
      for (const m of readFileSync(sheet, 'utf8').matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
        declared.add(m[1]!)
      }
    }
    // The sheets must actually have been read; an empty set would make this
    // test pass by finding nothing, which is the way a guard like this dies.
    expect(declared.size).toBeGreaterThan(60)

    const orphans = new Map<string, string[]>()
    for (const file of walk(ROOT)) {
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const m of source.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
        const name = m[1]!
        if (declared.has(name) || SET_INLINE.has(name)) continue
        orphans.set(name, [...(orphans.get(name) ?? []), file.replace(ROOT + '/', '')])
      }
    }

    const report = [...orphans]
      .map(([name, files]) => `${name} — ${files.length} file(s), first ${files[0]}`)
      .join('\n')
    expect(report, `custom properties referenced but never declared:\n${report}`).toBe('')
  })
})
