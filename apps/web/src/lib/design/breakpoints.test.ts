import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * `sm:` `md:` `lg:` `xl:` `2xl:` DO NOT EXIST IN THIS APP, AND THEY FAIL SILENTLY.
 *
 * ── THE DEFECT, MEASURED ─────────────────────────────────────────────────────
 * `globals.css` wipes the stock scale with `--breakpoint-*: initial` and defines
 * exactly two: `narrow` (700px) and `wide` (1180px). Tailwind does not warn about
 * an unknown variant — it emits nothing at all. Compiled on 2026-08-20 against
 * this app's own `@theme` block, `md:grid-cols-2` produced ZERO bytes of CSS
 * while `wide:grid-cols-2` and `max-narrow:grid-cols-1` compiled normally.
 *
 * So `grid gap-3 md:grid-cols-2` is a one-column grid at every width, forever,
 * on a 27-inch monitor. Fifteen such classes were live across thirteen files —
 * five of them on the Ads section, whose whole job is to show what a screen will
 * look like. Nothing caught it: typecheck cannot see a string, lint has no rule
 * for it, and the class LOOKS correct to anyone who has used Tailwind anywhere
 * else. It is invisible in review precisely because it is idiomatic elsewhere.
 *
 * ── WHY A SOURCE SCAN AND NOT A RENDERED CHECK ───────────────────────────────
 * A rendered check would have to guess which element should have gone
 * multi-column and at what width, and would pass for a page nobody wrote a case
 * for. The property here is simpler and total: this vocabulary has two words in
 * it, and any file using a third is wrong wherever it appears.
 *
 * ── WHAT TO WRITE INSTEAD ────────────────────────────────────────────────────
 * `narrow:` for "700px and up", `wide:` for "1180px and up", and their
 * `max-narrow:` / `max-wide:` counterparts for below. docs/26 §9 and
 * `globals.css` are the authority; add a breakpoint THERE first if two are
 * genuinely not enough, rather than reaching for a name that compiles to
 * nothing.
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
 * A stock breakpoint prefix on a utility class.
 *
 * Anchored on a quote, a space or a backtick so `cmd:`, a URL's `https:` and an
 * object key like `sm: 4` cannot match — the prefix must begin a class. The
 * trailing `[a-z[-]` requires an actual utility after the colon, which is what
 * separates `md:grid-cols-2` from the word "md:" in a sentence.
 */
const DEAD_VARIANT = /(?<=["'`\s])(?:sm|md|lg|xl|2xl):(?=[a-z[-])/g

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    // This file names them in order to ban them.
    if (/breakpoints\.test\.ts$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

/**
 * The corpus, read ONCE so the count below and the ban below it are the same set.
 *
 * MEASURED 2026-08-20: with `WEB_SRC` re-pointed at a directory holding no `.tsx`
 * at all, the ban still reported `Tests 2 passed` — the emptiness assertion was
 * being handed an empty list by an empty walk and could not tell that from a
 * clean tree. The defect this file exists for is the most expensive one the
 * design system has had (fifteen classes across thirteen files permanently
 * single-column, emitting no CSS and no warning), and its guard was passing by
 * not looking.
 */
const SOURCES = sourceFiles(WEB_SRC)

/**
 * apps/web/src held 700+ .tsx/.ts files when this was written. The floor is set
 * far below that on purpose: it must catch a walker that returns nothing or
 * nearly nothing, not fail every time somebody deletes a component.
 */
const MIN_EXPECTED_SOURCES = 200

describe('only the two declared breakpoints exist', () => {
  test('the walker finds the source tree, so the ban below is not vacuous', () => {
    expect(
      SOURCES.length,
      `Only ${SOURCES.length} source files found under ${WEB_SRC}. The ban below ` +
        'asserts a list is empty; an empty walk satisfies it without reading a byte.',
    ).toBeGreaterThan(MIN_EXPECTED_SOURCES)
  })

  test('no source file uses a stock Tailwind breakpoint prefix', () => {
    const offenders: string[] = []
    for (const file of SOURCES) {
      const matches = readFileSync(file, 'utf8').match(DEAD_VARIANT)
      if (!matches) continue
      const rel = relative(join(repoRoot(), 'apps/web'), file).split('\\').join('/')
      offenders.push(`${rel} (${[...new Set(matches)].join(' ')})`)
    }

    expect(
      offenders,
      'These files use a breakpoint prefix that globals.css wiped with ' +
        '`--breakpoint-*: initial`. Tailwind emits NOTHING for it, so the rule never ' +
        'applies at any width and the layout is silently stuck at its base. Use ' +
        '`narrow:` (>=700px) or `wide:` (>=1180px), or their max- counterparts.',
    ).toEqual([])
  })

  test('globals.css still declares exactly the two this test assumes', () => {
    // The ban above is only correct while the theme really has two breakpoints.
    // If someone adds a third, this fails first and says so, rather than the ban
    // quietly outlawing a name that now works.
    const css = readFileSync(join(repoRoot(), 'apps/web/src/app/globals.css'), 'utf8')
    const declared = [...css.matchAll(/--breakpoint-([a-z0-9]+):/g)].map((m) => m[1])
    expect(css).toContain('--breakpoint-*: initial')
    expect(declared.sort()).toEqual(['narrow', 'wide'])
  })
})
