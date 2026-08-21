import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * `dark:text-ink` may never sit on `dark:bg-white`.
 *
 * ── WHY THIS NEEDS A MACHINE ────────────────────────────────────────────────
 * `--ink` INVERTS. It is `#000000` in light and `#ffffff` in dark
 * (packages/shared/tokens.css). So `dark:text-ink` does not mean "the strong
 * text colour" in dark — it means, literally, WHITE. On a dark surface that is
 * right and it is what the token is for. On `dark:bg-white` it is white on
 * white, and the label disappears.
 *
 * The pair reads as obviously correct in review, which is the whole problem:
 * `bg-ink text-white dark:bg-white dark:text-ink` looks like a tidy inversion —
 * black-on-white becomes white-on-black — and every one of those four tokens is
 * individually the right choice. The defect only exists in the COMBINATION, and
 * only in one theme, so a light-mode screenshot shows nothing and a dark-mode
 * screenshot shows an empty chip that reads as "unstyled", not as "broken".
 *
 * It shipped twice from one convention. `components/ui/button.tsx` already
 * carries the correct form and its comment names six components as following
 * it — "channel-picker, pick-chips, conversation-list, step-rail, variant-tabs,
 * badge". Two of the six named did not: `pick-chips.tsx` (the selected chip) and
 * `step-rail.tsx` (the completed-step disc) both paired `dark:bg-white` with
 * `dark:text-ink`. A comment asserting compliance is not compliance, and that is
 * exactly the gap a source guard closes.
 *
 * THE FIX: `dark:text-[var(--canvas)]`.
 *
 * Two things about the alternatives, both MEASURED against the built stylesheet
 * rather than assumed, because the first was asserted wrongly on the way in:
 *
 *   · `dark:text-canvas` DOES work. `globals.css` registers
 *     `--color-canvas: var(--canvas)` in its `@theme` block, so Tailwind 4
 *     generates the utility, and it lands in the SAME rule as the arbitrary
 *     form: `.dark\:text-\[var\(--canvas\)\], .dark\:text-canvas { color: var(--canvas) }`.
 *     The bracket form is used anyway because `components/ui/button.tsx` already
 *     uses it and one spelling per convention is worth more than two correct ones.
 *   · `dark:text-[--canvas]` does NOT compile. A bare custom property inside the
 *     brackets produces no rule at all, so the class is inert and the element
 *     silently keeps whatever colour it inherited. That is the near-miss worth
 *     naming: it fails at build time by emitting nothing, which looks exactly
 *     like the bug it was meant to fix.
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
    if (!/\.tsx?$/.test(entry.name)) continue
    // Tests may name the pair freely — they are where we assert about it.
    if (/\.test\.tsx?$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

/**
 * A class string, as it appears in source: one quoted run of utilities.
 *
 * Scanning per-QUOTED-STRING rather than per-file is the point. A file may
 * legitimately contain `dark:bg-white` in one element and `dark:text-ink` in a
 * different one, and flagging that would be a false positive that teaches people
 * to add exceptions. The defect is the two tokens landing on the SAME element,
 * which in practice means the same quoted string or the same `cn()` argument.
 */
const QUOTED = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g

interface Offence {
  file: string
  text: string
}

function offences(): Offence[] {
  const found: Offence[] = []
  for (const file of sourceFiles(WEB_SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(QUOTED)) {
      const text = match[1] ?? match[2] ?? match[3] ?? ''
      if (!text.includes('dark:bg-white')) continue
      if (!/(?:^|\s)dark:text-ink(?:\s|$)/.test(text)) continue
      found.push({ file: relative(repoRoot(), file), text })
    }
  }
  return found
}

describe('dark:text-ink on dark:bg-white', () => {
  /**
   * The guard, stated as the thing it forbids.
   *
   * A GUARD NEVER SHOWN TO FAIL IS NOT A GUARD, so the message prints the
   * offending string rather than a count: `expect([]).toEqual([])` passing tells
   * you nothing about whether the matcher can see anything at all. The
   * self-check below proves it can.
   */
  test('no element paints white text on a white dark-mode fill', () => {
    expect(offences().map((o) => `${o.file} :: ${o.text}`)).toEqual([])
  })

  /**
   * THE MATCHER, SHOWN BITING.
   *
   * This is the exact string that shipped in `pick-chips.tsx` and
   * `step-rail.tsx`. If the detector above is ever loosened — a changed
   * variant prefix, a renamed token — this test fails and says so, rather than
   * the suite going quietly green on a scan that matches nothing.
   */
  test('the detector recognises the pair that actually shipped', () => {
    const shipped = 'bg-ink text-white dark:bg-white dark:text-ink'
    expect(shipped.includes('dark:bg-white')).toBe(true)
    expect(/(?:^|\s)dark:text-ink(?:\s|$)/.test(shipped)).toBe(true)
  })

  /**
   * And NOT biting on the repair, nor on the two legitimate neighbours:
   * `dark:text-ink-faint` (a different token, and one the ink-faint guard owns)
   * and a `dark:text-ink` with no white fill under it, which is correct.
   */
  test('the detector clears the repair and the legitimate uses', () => {
    const repaired = 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
    expect(/(?:^|\s)dark:text-ink(?:\s|$)/.test(repaired)).toBe(false)

    // A near-miss the word-boundary must not swallow.
    expect(/(?:^|\s)dark:text-ink(?:\s|$)/.test('dark:text-ink-faint')).toBe(false)

    // White text on a dark surface — the token doing its actual job.
    expect('rounded-card bg-s2 dark:text-ink'.includes('dark:bg-white')).toBe(false)
  })
})
