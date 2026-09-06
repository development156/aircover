import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findUnmountedComponents, keyOf, stripComments } from './unmounted-components.mjs'

/**
 * A COMPONENT NOBODY PUTS ON A SCREEN.
 *
 * The 2026-09-01 review found the same fact four times — a formatter never
 * called, a sentence computed and discarded, a discard button nothing mounted, a
 * drag handler painting a duplicate — and then found 14 files, about 2,000 lines,
 * unreachable from any screen. Its remedy was `noUnusedLocals`, which is on and
 * project-wide and CANNOT SEE ANY OF IT: TypeScript never reports an exported
 * symbol nobody imports.
 *
 * This is the check that can. It is a ratchet, not a wall — the existing entries
 * are grandfathered in `ops/lint-baselines/unmounted-components.json`, which can
 * shrink and can never grow. Same shape as the design lint and the scanner
 * registry, and for the same reason: a rule that fails on day one is a rule
 * someone deletes.
 *
 * ── WHAT THIS CANNOT SEE, since it is subject to the scanner registry's rule ──
 * Everything in `unmounted-components.mjs`'s own header: it matches text rather
 * than an import graph, so a component mounted through a variable, a lookup
 * table, or a dynamic import reads as mounted only if its NAME appears in
 * product source. It reads `.tsx` only. It cannot tell a component from a
 * PascalCase constant. And it says nothing about whether a mounted component is
 * REACHABLE — a screen no navigation links to still counts as mounted.
 *
 * It also cannot tell "left unwired on purpose, shipping next week" from
 * "forgotten". That is the point of the baseline naming every file: a person
 * reads the diff and decides, and the ratchet only insists the list not grow.
 */

const REPO = resolve(import.meta.dirname, '../..')
const BASELINE = resolve(REPO, 'ops/lint-baselines/unmounted-components.json')

const found = findUnmountedComponents(REPO)
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))

/* The remedy this file prints has to be runnable, so it runs BEFORE `describe`
   is registered and exits — the file is a test under vitest and a CLI under
   node. `scanner-registry.test.mjs` learned this the hard way: its update
   command sat below `describe(...)` and crashed with a @vitest/runner stack
   trace instead of writing anything. */
if (process.argv.includes('--update-baseline')) {
  const keys = found.map(keyOf)
  const known = new Set(baseline.unmounted)
  const unseen = keys.filter((k) => !known.has(k))

  // Absorbing a NEW one is always deliberate and always named. A count would
  // conflate "a component was just orphaned" with "the register is meeting a
  // file for the first time", and only the first is a regression.
  if (unseen.length > 0 && !process.argv.includes('--absorb-new')) {
    console.error(`  baseline NOT written — ${unseen.length} component(s) new to the register:`)
    for (const k of unseen) console.error(`  REFUSED  ${k} (need --absorb-new)`)
    process.exit(1)
  }
  for (const k of unseen) console.log(`  absorbing  ${k}`)
  writeFileSync(BASELINE, `${JSON.stringify({ unmounted: keys }, null, 2)}\n`)
  console.log(`baseline: ${baseline.unmounted.length} → ${keys.length}`)
  process.exit(0)
}

describe('a component nothing renders', () => {
  it('finds them by reading the tree, not from a list', () => {
    // If the scan ever collapses, every assertion below goes vacuously green.
    // There are ~579 exported components; a handful means the walk broke.
    expect(found.length).toBeLessThan(200)
    expect(baseline.unmounted.length).toBeGreaterThan(0)
  })

  it('refuses a NEW one, which is a feature shipped switched off', () => {
    const added = found.map(keyOf).filter((k) => !baseline.unmounted.includes(k))

    expect(
      added,
      `These are exported from components/ and rendered by no product file. ` +
        `Either mount them, or delete them, or — if this is deliberate and ` +
        `temporary — run \`node scripts/lib/unmounted-components.test.mjs ` +
        `--update-baseline --absorb-new\` so the debt is recorded by name rather ` +
        `than discovered by a customer.`,
    ).toEqual([])
  })

  it('the baseline can only shrink', () => {
    expect(
      found.length,
      `${baseline.unmounted.length - found.length} component(s) got mounted or ` +
        `removed — run \`node scripts/lib/unmounted-components.test.mjs ` +
        `--update-baseline\` to lock the gain in.`,
    ).toBeLessThanOrEqual(baseline.unmounted.length)
  })

  it('cannot carry a stale entry forever', () => {
    // A baselined component that is now mounted, renamed or deleted is a lie the
    // ratchet would hold indefinitely.
    const current = new Set(found.map(keyOf))
    const gone = baseline.unmounted.filter((k) => !current.has(k))
    expect(gone, 'baseline names components that are no longer unmounted — remove them').toEqual([])
  })

  it('says which of them have tests, because that is the worse case', () => {
    // A component with tests and no mount reads as finished work in every review
    // and in the commit message, and ships switched off. `week-card.tsx` and
    // `report-body.tsx` are both in the 2026-09-01 review's decision item.
    expect(found.some((c) => c.tested)).toBe(true)
  })
})

describe('the scan itself', () => {
  it('ignores app/ entirely, where never-imported is correct', () => {
    // Every page.tsx, layout.tsx, loading.tsx and error.tsx is a framework entry
    // point. MEASURED 2026-09-01: 79 of 91 raw hits came from app/, and a rule
    // that is 87% noise on day one does not survive its first red build.
    expect(found.every((c) => !c.file.startsWith('apps/web/src/app/'))).toBe(true)
  })

  it('does not count a component named only in a comment as mounted', () => {
    // MEASURED 2026-09-04, hours after this file was written: the first version
    // counted a name anywhere in product text, and that hid the two LARGEST
    // orphans in the repository. `WeekGrid` (187 lines, tested) is named in
    // three block comments — month-grid.tsx, week-timeline.tsx and the planner
    // page, each explaining what it does or why something else was chosen —
    // and rendered nowhere. `OnboardingFlow` (417 lines, tested) is named once,
    // in a comment in (onboarding)/error.tsx, and rendered nowhere.
    //
    // A guard whose blind spot is "somebody explained this component" is blind
    // exactly where a careful codebase writes most. Same defect this lane fixed
    // in scanner-registry.mjs the same day.
    const mentioned = '/** Rendering `Thing` here would have been wrong. */\nexport const A = 1\n'
    expect(stripComments(mentioned)).not.toContain('Thing')

    expect(stripComments('// see Thing for why\nconst a = 1')).not.toContain('Thing')
  })

  it('keeps a URL in a string, because eating a code line would invent an orphan', () => {
    // `https://…` contains `//`. Stripping from there to end of line would drop
    // any component named later on that line and report it unmounted.
    const line = `const u = 'https://x.test/a'; render(<Thing />)`
    expect(stripComments(line)).toContain('Thing')
    expect(stripComments(line)).toContain('https://x.test/a')
  })

  it('does not count a component’s own test as a use', () => {
    // Counting tests as usage would hide the entire class: the four defects this
    // exists for were all written, tested, and mounted nowhere.
    const tested = found.filter((c) => c.tested)
    expect(tested.length).toBeGreaterThan(0)
  })
})
