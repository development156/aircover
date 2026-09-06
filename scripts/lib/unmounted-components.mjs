import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * COMPONENTS THAT ARE FINISHED, TESTED, AND RENDERED BY NOTHING.
 *
 * ── THE DEFECT CLASS ─────────────────────────────────────────────────────────
 * Four items in the 2026-09-01 review were one fact: a formatter that existed
 * and was never called, a stuck-request sentence computed and thrown away, a
 * discard button whose dialog and action both existed with nothing mounting it,
 * and a drag handler painting a duplicate. The review's own remedy was to switch
 * on `noUnusedLocals` / `noUnusedParameters` in `tsconfig.base.json`, and that is
 * real and project-wide — MEASURED 2026-09-01, all ten tsconfigs inherit it and
 * none overrides it.
 *
 * But it cannot see this class. TypeScript never reports an EXPORTED symbol
 * nobody imports, so a component that is written, exported, tested and mounted
 * nowhere compiles clean forever. The same review then found 14 files unreachable
 * from any screen — about 2,000 lines — which is this defect at scale, and the
 * check credited with preventing it could not have.
 *
 * ── WHY COMPONENTS, AND WHY NOT `app/` ───────────────────────────────────────
 * A general unused-export sweep over `apps/web/src` returns 103 symbols and most
 * are fine: fixture data, lint-rule tables, deliberate test helpers. A component
 * is different. It exists to be put on a screen, so one that nothing renders has
 * a single meaning, and it is the meaning the review kept finding.
 *
 * `app/**` is excluded entirely rather than filtered: every `page.tsx`,
 * `layout.tsx`, `loading.tsx`, `error.tsx` and `not-found.tsx` is a framework
 * entry point that is correctly never imported. MEASURED: 79 of 91 hits came
 * from there, and a rule that is 87% noise on day one is a rule someone deletes.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It matches TEXT, not an import graph, so:
 *  · a component rendered through a variable, a map of components, a string key,
 *    or `React.createElement(Whichever)` reads as mounted if the NAME appears
 *    anywhere in product source, and as unmounted if it does not. Both directions
 *    are possible and neither is detected as uncertain.
 *  · a component reached only by `next/dynamic` with a template-literal path is
 *    invisible to it.
 *  · it reads `*.tsx` only, so a component defined in a `.ts` file is not seen.
 *  · it cannot tell a component from a PascalCase constant in a `.tsx` file —
 *    `DRAWN_KINDS` and `THEME_SCRIPT_SOURCE` are both false positives and are
 *    carried in the baseline rather than special-cased, because a name-shape rule
 *    that grows exceptions stops being readable.
 *  · it says nothing about whether a MOUNTED component is reachable by a user:
 *    a screen no navigation links to still counts as mounted here.
 */

/** Where a component lives. `app/**` is framework entry points, not mounts. */
const COMPONENT_GLOB = 'apps/web/src/components'

const IS_TEST = /\.test\.|\.spec\./

/** `export function Foo`, `export const Foo`, `export default function Foo`. */
const EXPORTED_PASCAL =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/gm

/**
 * WRITING ABOUT A COMPONENT IS NOT MOUNTING IT.
 *
 * The first version of this counted a name anywhere in product text as a use,
 * and MEASURED 2026-09-04 that hid the two largest orphans in the repository:
 * `WeekGrid` (187 lines, tested) is named in three block comments — in
 * `month-grid.tsx`, `week-timeline.tsx` and the planner page, each explaining
 * what it does or why something else was chosen instead — and rendered nowhere;
 * `OnboardingFlow` (417 lines, tested) is named once, in a comment in
 * `(onboarding)/error.tsx`, and rendered nowhere. A guard whose blind spot is
 * "somebody explained this component" is blind exactly where a careful codebase
 * writes most.
 *
 * That is the same defect this lane fixed in `scanner-registry.mjs` on the same
 * day — a rule that cannot tell a description from the thing described — and it
 * was in this file within hours of writing that one down.
 *
 * Block comments go first and completely. Line comments are removed only when
 * the `//` is not preceded by a colon, so `https://…` inside a string survives:
 * over-keeping a line is safe here (it can only count a use that is not one,
 * which is the direction that was already true), while eating a line of real
 * code would invent an orphan.
 */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Every `.tsx` under apps/web/src, tracked or not, so an uncommitted one counts. */
function tsxFiles(repoRoot) {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/web/src'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter((f) => f.endsWith('.tsx'))
}

/**
 * Components declared under `components/` that no PRODUCT file mentions.
 *
 * Usage is counted across all product `.tsx` — including `app/**`, which is
 * where most components are actually mounted — and deliberately EXCLUDES tests.
 * A component with tests and no mount is the exact shape this looks for, so
 * counting its own test as a use would hide every case worth finding.
 */
export function findUnmountedComponents(repoRoot) {
  const files = tsxFiles(repoRoot)
  const product = files.filter((f) => !IS_TEST.test(f))
  const tests = files.filter((f) => IS_TEST.test(f))

  const read = (f) => readFileSync(resolve(repoRoot, f), 'utf8')

  // Comments are stripped from the USAGE corpus, never from the declaration
  // scan: explaining a component is not mounting it. See `stripComments`.
  const productText = product.map((f) => stripComments(read(f))).join('\n')
  const testText = tests.map((f) => stripComments(read(f))).join('\n')

  const mentions = (text, name) =>
    text.split(new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`)).length - 1

  const found = []
  for (const file of product) {
    if (!file.startsWith(COMPONENT_GLOB)) continue
    for (const [, name] of read(file).matchAll(EXPORTED_PASCAL)) {
      // One mention is its own declaration.
      if (mentions(productText, name) > 1) continue
      found.push({ file, name, tested: mentions(testText, name) > 0 })
    }
  }
  return found.sort((a, b) => `${a.file}${a.name}`.localeCompare(`${b.file}${b.name}`))
}

/** The stable key a baseline entry is recorded under. */
export function keyOf({ file, name }) {
  return `${file}::${name}`
}
