import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { INK_FAINT_EXCEPTIONS } from './ink-faint-exceptions'

/**
 * `--ink-faint` may not be used as content text.
 *
 * The token is #a8a29e — roughly 2.5:1 on a white card, against a 4.5:1 floor.
 * A contrast sweep of the five main screens after the v3 token swap found that
 * EVERY failing string in the app was this one token: the Sahoda assistant line,
 * "No content written yet", "Not scheduled", "(optional)", every CardLabel
 * eyebrow and every ledger table header. Not one of them is decorative.
 *
 * The reason it spread is that nothing said no. `text-faint` reads like an
 * ordinary muted-text utility, so it kept getting reached for whenever text
 * needed to recede — and the failure is invisible to anyone with good eyesight
 * on a good screen, which describes everyone who has reviewed this codebase.
 *
 * So this test says no mechanically. Every application of the token must be
 * declared in `ink-faint-exceptions.ts` with a reason, and the count must match
 * exactly, so a new use cannot ride along inside an already-listed file.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/** Walk up until the directory containing `packages/` — worktree-path agnostic. */
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
 * Every way the token can reach an element: the legacy `text-faint` utility, its
 * v3 name `text-ink-faint`, either behind a variant prefix (`placeholder:`,
 * `dark:`, `disabled:`…), and the raw custom properties for hand-written CSS.
 *
 * The `[\w:-]*` prefix is what catches `placeholder:text-faint`; without it a
 * variant would smuggle the token past the gate.
 */
const INK_FAINT_PATTERN = /(?:[\w-]+:)*text-(?:ink-)?faint\b|var\(--(?:ink-)?faint\)/g

/**
 * Files that DECLARE the token rather than apply it.
 *
 * `tokens-css-inline.ts` is a verbatim mirror of packages/shared/tokens.css, so
 * it necessarily contains the `--faint: var(--ink-faint)` alias. That is the
 * design system defining its own vocabulary, not a component painting text —
 * and it is regenerated from the token file, so it could never be "fixed" here
 * anyway. Kept as a path exclusion rather than an entry in
 * INK_FAINT_EXCEPTIONS, because its reason is not "disabled or decorative".
 */
const TOKEN_SOURCE_FILES: ReadonlySet<string> = new Set(['src/lib/sites/tokens-css-inline.ts'])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    // Tests may name the token freely — they are where we assert about it.
    if (/\.test\.tsx?$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

/** file path (relative to apps/web) -> how many times it applies --ink-faint. */
function usesByFile(): Map<string, number> {
  const found = new Map<string, number>()
  for (const file of sourceFiles(WEB_SRC)) {
    const matches = readFileSync(file, 'utf8').match(INK_FAINT_PATTERN)
    if (!matches) continue
    const rel = relative(join(repoRoot(), 'apps/web'), file).split('\\').join('/')
    if (TOKEN_SOURCE_FILES.has(rel)) continue
    found.set(rel, matches.length)
  }
  return found
}

describe('--ink-faint is disabled/decorative only', () => {
  test('no file applies it without a declared exception', () => {
    const undeclared = [...usesByFile().keys()].filter((f) => !(f in INK_FAINT_EXCEPTIONS))

    expect(
      undeclared,
      'These files paint text with --ink-faint (~2.5:1). Content text must use --ink-mute ' +
        '(text-muted / text-ink-mute, 5.4:1). If a use is genuinely a disabled control or an ' +
        'aria-hidden decoration, declare it in ink-faint-exceptions.ts with a reason.',
    ).toEqual([])
  })

  test('declared exceptions use it exactly as many times as they claim', () => {
    const actual = usesByFile()
    const drift = Object.entries(INK_FAINT_EXCEPTIONS)
      .map(([file, exception]) => ({
        file,
        declared: exception.uses,
        actual: actual.get(file) ?? 0,
      }))
      .filter((row) => row.declared !== row.actual)

    expect(
      drift,
      'An allowlisted file changed its --ink-faint count. If the new use is content, move it to ' +
        '--ink-mute; if it is disabled or decorative, raise `uses` and extend the reason.',
    ).toEqual([])
  })

  test('every exception still exists — no stale entries', () => {
    const actual = usesByFile()
    const stale = Object.keys(INK_FAINT_EXCEPTIONS).filter((file) => !actual.has(file))

    expect(stale, 'These files no longer use --ink-faint. Delete their exception.').toEqual([])
  })

  test('every exception states a reason', () => {
    for (const [file, exception] of Object.entries(INK_FAINT_EXCEPTIONS)) {
      expect(exception.reason.trim().length, `${file} has an empty reason`).toBeGreaterThan(20)
      expect(exception.uses, `${file} declares a non-positive count`).toBeGreaterThan(0)
    }
  })

  test('the pattern catches variant-prefixed and v3-named uses', () => {
    // Guards the gate itself: `placeholder:text-faint` is how the token reached
    // every input in the app, and `text-ink-faint` is the name new code will use.
    const samples = [
      'placeholder:text-faint',
      'disabled:text-faint',
      'dark:text-ink-faint',
      'text-ink-faint',
      'text-faint',
      'var(--ink-faint)',
      'var(--faint)',
    ]
    for (const sample of samples) {
      expect(sample.match(new RegExp(INK_FAINT_PATTERN.source, 'g')), sample).toHaveLength(1)
    }
    // and does not fire on unrelated names
    expect(
      'text-faintish bg-faint-blue'.match(new RegExp(INK_FAINT_PATTERN.source, 'g')),
    ).toBeNull()
  })
})
