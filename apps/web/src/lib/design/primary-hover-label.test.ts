import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * No component decides what colour labels the primary's hover fill.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * `--pfg` is #000000 in every theme, so it cannot label the LIGHT theme's hover
 * fill, which is also #000000. Nine call sites in eight files solved that the
 * same way and independently: `hover:text-white` written beside
 * `hover:bg-primary-strong`. Every one of them was correct, and every one was
 * correct only for light.
 *
 * That went unnoticed for as long as `--pstrong` was black in BOTH themes — a
 * hardcoded white is right on black wherever the black is. It became a defect
 * the moment dark got its own hover fill (2026-09-01): white on that measures
 * 2.57:1, and no token guard could see it, because every token
 * involved was correct. This is docs/37 §19's own warning arriving again:
 * "Guards that grade TOKENS cannot see what COMPONENTS write. `--pfg` was
 * correct for weeks while three components wrote `text-white` on a brand fill."
 *
 * So the pair moved into tokens as `--pstrong` / `--pstrong-fg`, and this is the
 * guard that keeps it there. `own-medicine.test.ts` grades the tokens; this
 * grades the call sites, and neither can do the other's job.
 *
 * ── WHAT THIS SCANNER CANNOT SEE ─────────────────────────────────────────────
 * It matches class strings in the source text, so it is blind to:
 *
 *   · a class name BUILT at runtime — `\`hover:text-${tone}\``, a clsx branch
 *     with the colour in a variable, or a utility passed in through a prop. A
 *     component that assembles its hover colour from parts reads as clean here.
 *   · any colour applied by CSS rather than by a utility: a `<style>` block, a
 *     `.css` file, an inline `style={{ color }}`, or a `:hover` rule written in
 *     `globals.css`.
 *   · a component that renders the primary hover fill WITHOUT the
 *     `hover:bg-primary-strong` utility — by writing `hover:bg-[var(--pstrong)]`
 *     or by nesting inside something else that sets the background.
 *   · anything that is not a `.tsx` component: a `.ts` helper that returns a
 *     className string, a `.mjs` script, a `.css` file. Tests and specs are
 *     excluded within `.tsx` too. That boundary exists because three files here
 *     DISCUSS this utility in prose — this header, its sibling in
 *     `own-medicine.test.ts`, and the generated `lib/sites/tokens-css-inline.ts`
 *     — and a scanner reading its own explanation as a call site reports a
 *     defect that is a sentence. The cost of the boundary is a className built
 *     in a `.ts` helper, which is real and currently unused.
 *   · whether `--pstrong-fg` is the RIGHT colour. That is a token question and
 *     `own-medicine.test.ts` answers it; this file only checks that the decision
 *     was left to the token.
 *
 * It reads the working tree through `git grep --untracked`, so it CAN see a file
 * added in the same commit as the defect. A sibling scanner in this repository
 * omitted that flag and could not see the file being written beside it.
 */

const WEB_SRC = resolve(import.meta.dirname, '../..')
const REPO_ROOT = resolve(WEB_SRC, '../../..')

/** Every line in `apps/web/src` that paints the primary's hover fill. */
function hoverFillLines(): string[] {
  try {
    return execFileSync(
      'git',
      [
        'grep',
        '--untracked',
        '-n',
        '--',
        'hover:bg-primary-strong',
        // ONLY components, and that boundary is load-bearing rather than tidy.
        // Three separate files in this repository MENTION the utility in prose
        // — this header, its sibling in `own-medicine.test.ts`, and the
        // generated `lib/sites/tokens-css-inline.ts`, which mirrors the token
        // file's own comment about the defect. A scanner that reads the
        // explanation of a bug as an instance of it reports a defect that is a
        // sentence, and this one did, twice, before the boundary was drawn.
        // A className can only reach a customer through a rendered component.
        ':(glob)apps/web/src/**/*.tsx',
        ':!*.test.tsx',
        ':!*.spec.tsx',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line.trim() !== '')
  } catch (error) {
    // `git grep` exits 1 for "no matches", which is a real answer and not a
    // failure. Anything else is the scanner itself being broken, and a broken
    // scanner must not report clean.
    if ((error as { status?: number }).status === 1) return []
    throw error
  }
}

/**
 * A hardcoded text colour written as a hover utility. `text-primary-strong-
 * foreground` is the token and is deliberately not matched; `text-white`,
 * `text-black`, `text-ink`, `text-[#fff]` and friends are what this refuses.
 */
const HARDCODED_HOVER_TEXT = /hover:text-(?!primary-strong-foreground\b)[a-z[]/

describe('the primary hover fill is labelled by a token, never by a component', () => {
  it('finds the call sites at all', () => {
    // A scanner that matched nothing would pass the assertion below forever.
    // This is the line that fails when the utility is renamed out from under it.
    expect(hoverFillLines().length).toBeGreaterThan(0)
  })

  it('no component forces its own colour onto the hover fill', () => {
    const offenders = hoverFillLines().filter((line) => HARDCODED_HOVER_TEXT.test(line))

    expect(
      offenders,
      'These lines paint the primary hover fill and then choose their own text ' +
        'colour. That colour can only be right in one theme, because `--pstrong` ' +
        'is near-black on light and a bright orange on dark. Use ' +
        '`hover:text-primary-strong-foreground`, which is `--pstrong-fg` and ' +
        'flips with the theme.\n' +
        offenders.join('\n'),
    ).toEqual([])
  })

  it('every call site actually names the token', () => {
    const missing = hoverFillLines().filter(
      (line) => !line.includes('hover:text-primary-strong-foreground'),
    )

    // Stricter than the assertion above on purpose: a site that sets no hover
    // text at all keeps `--pfg`, which is #000000, and #000000 on the LIGHT
    // theme's #000000 hover fill is the original bug rather than a new one.
    expect(
      missing,
      'These lines change the fill on hover and leave the label as `--pfg`, ' +
        "which is ink in every theme and so invisible on the light theme's " +
        'near-black hover fill.\n' +
        missing.join('\n'),
    ).toEqual([])
  })

  it('the token it points at is declared', () => {
    // The utility resolves through `@theme inline`, so a missing alias is a
    // class that compiles to nothing and fails silently at runtime.
    const globals = readFileSync(resolve(WEB_SRC, 'app/globals.css'), 'utf8')
    expect(globals).toContain('--color-primary-strong-foreground: var(--pstrong-fg);')
  })
})
