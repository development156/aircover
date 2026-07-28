import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { EYEBROW_EXCEPTIONS } from './eyebrow-exceptions'

/**
 * There is one eyebrow, and it is `--t-eyebrow`.
 *
 * The token defines the whole label: 600 11px/14px mono, `--t-eyebrow-ls`
 * tracking, uppercase. Nine places hand-rolled it anyway, at FIVE different
 * letter-spacings (0.06 / 0.08 / 0.12 / 0.14 / 0.16em) and four different sizes.
 * Nobody chose five values for one thing — each was copied from whichever
 * neighbour was nearest at the time, and none of them could follow the token
 * when it moved.
 *
 * The signature of a hand-rolled eyebrow is `uppercase` next to an arbitrary
 * `tracking-[…]`. Negative tracking on a display heading is a different thing
 * and is not uppercase, so it does not trip this.
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

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/**
 * A className string that turns text uppercase AND sets its own tracking.
 * Both signals together are what makes it an eyebrow rather than, say, a
 * tightened display heading.
 */
function handRolledEyebrows(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/className=\{?["'`]([^"'`]+)["'`]/g)) {
    const classes = match[1] ?? ''
    if (/\buppercase\b/.test(classes) && /\btracking-\[/.test(classes)) found.push(classes.trim())
  }
  return found
}

describe('the eyebrow is a token, not a recipe', () => {
  test('no component hand-rolls one', () => {
    const undeclared: string[] = []
    for (const file of sourceFiles(WEB_SRC)) {
      const rel = relative(WEB_SRC, file).split('\\').join('/')
      if (rel in EYEBROW_EXCEPTIONS) continue
      for (const classes of handRolledEyebrows(readFileSync(file, 'utf8'))) {
        undeclared.push(`${rel}: ${classes.slice(0, 80)}`)
      }
    }

    expect(
      undeclared.sort(),
      'Use `type-eyebrow` (--t-eyebrow + --t-eyebrow-ls + uppercase) and keep only the ' +
        'layout and colour classes. Hand-rolling it cannot follow the token when it moves. ' +
        'If it genuinely cannot be fixed yet, declare it in eyebrow-exceptions.ts with a ' +
        'reason and a card — and note the ratchet only lets that register shrink.',
    ).toEqual([])
  })

  test('declared exceptions hand-roll exactly as many as they claim', () => {
    // Pinning the count, not just the filename: otherwise a second hand-rolled eyebrow
    // rides into an already-listed file for free — the way the original set accumulated.
    const drift = Object.entries(EYEBROW_EXCEPTIONS)
      .map(([rel, exception]) => {
        const full = join(WEB_SRC, rel)
        const actual = existsSync(full) ? handRolledEyebrows(readFileSync(full, 'utf8')).length : 0
        return { file: rel, declared: exception.uses, actual }
      })
      .filter((row) => row.declared !== row.actual)

    expect(
      drift,
      'An allowlisted file changed its hand-rolled-eyebrow count. Fix it to type-eyebrow ' +
        '(and delete the entry) rather than raising the number.',
    ).toEqual([])
  })

  test('every exception states a reason and names a card', () => {
    for (const [file, exception] of Object.entries(EYEBROW_EXCEPTIONS)) {
      expect(exception.reason.trim().length, `${file} has an empty reason`).toBeGreaterThan(20)
      expect(exception.card, `${file} names no card`).toMatch(/^SL-\d+$/)
      expect(exception.since, `${file} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  test('the detector fires on the real shapes and not on display headings', () => {
    // Guards the gate itself.
    expect(handRolledEyebrows('className="font-mono tracking-[0.12em] uppercase"')).toHaveLength(1)
    expect(handRolledEyebrows('className="text-[11px] uppercase tracking-[0.08em]"')).toHaveLength(
      1,
    )
    // A tightened display heading: no uppercase, so not an eyebrow.
    expect(handRolledEyebrows('className="font-extrabold tracking-[-0.01em]"')).toHaveLength(0)
    // Uppercase alone is fine — the token itself supplies the tracking.
    expect(handRolledEyebrows('className="type-eyebrow text-muted"')).toHaveLength(0)
  })
})
