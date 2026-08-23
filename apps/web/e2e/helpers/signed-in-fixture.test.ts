import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { seededTestName, testCases, testsMissingTheFixture } from './fixture-audit'

/**
 * A TEST THAT IMPORTS THE SIGNED-IN FIXTURE MUST ACTUALLY REQUEST IT.
 *
 * ── THE DEFECT THIS CLOSES, WHICH COST TWO RUNS ──────────────────────────────
 * Playwright runs a fixture only if the test DESTRUCTURES it. A spec that
 * imports `test` from `fixtures/seeded-user` and then writes
 *
 *     test('…', async ({ page }) => { … })
 *
 * never signs in, never mints a Clerk user and never creates a workspace. Every
 * assertion in it then runs against /sign-in, and the failure names whatever
 * element the test was looking for — "create workspace button not found",
 * "heading not found" — which reads exactly like a product regression.
 *
 * MEASURED 2026-08-23: six tests in `onboarding-routing.spec.ts`, then, after
 * that file was fixed, three more in `onboarding-boot-video.spec.ts`. The second
 * three are the point. Fixing the first file taught nothing about its sibling
 * and nothing in the repository could see the shape, so the answer is a rule
 * rather than a third careful reading.
 *
 * ── TWO KINDS OF TEST HERE, AND THE FIRST KIND IS WHY ───────────────────────
 * The sweep at the bottom reads the real suite, and it can only ever prove the
 * rule does not FIRE — every file passes today, so a rule broken into always
 * answering "clean" would look identical. MEASURED by mutation: widening the
 * public-route list to `['/']` exempts the whole application, and the sweep
 * stayed green.
 *
 * So the positive cases come first and they are synthetic: sources written to be
 * broken, with the rule required to say so. `fixture-audit.ts` takes strings for
 * exactly this reason.
 *
 * ── WHY VITEST AND NOT A LINT RULE ───────────────────────────────────────────
 * `apps/web` has no eslint configuration, so a lint rule has nowhere to live.
 * This runs in the ordinary `turbo test` leg, checked by every gate rather than
 * by whoever remembers.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It reads source as TEXT, so every one of these walks straight past it:
 *
 *  · A navigation whose path is not a literal — `page.goto(url)`,
 *    `page.goto(`/posts/${id}`)`, a route held in a const. Only
 *    `.goto('/…')` with the path written out is matched.
 *  · A helper defined in ANOTHER FILE. `helperBodies` resolves `async function`
 *    declarations in the same source only, so a test whose whole body is
 *    `await bootstrapWorkspace(page)` — imported from `./fixtures/compose` — is
 *    read as a test that never navigates. CHECKED 2026-08-24: all fifteen specs
 *    that import that helper already request `signedIn`, so this is a latent
 *    gap and not an open one. Cross-file resolution is the fix if it ever
 *    catches something.
 *  · Whether a test that DOES request the fixture makes any use of it. Asking
 *    for `signedIn` and then asserting nothing passes trivially.
 *  · A spec that reaches the app some other way — a raw `fetch`, an API route,
 *    a `context.request` call.
 *
 * It is a rule about one specific shape that has now cost three files, not a
 * proof that a spec is correctly authenticated.
 */

const E2E = join(import.meta.dirname, '..')

const IMPORT = `import { expect, test } from './fixtures/seeded-user'\n`

describe('the rule fires', () => {
  test('a navigating test without the fixture is named', () => {
    const source = `${IMPORT}
      test('opens the dashboard', async ({ page }) => {
        await page.goto('/home')
      })`

    expect(testsMissingTheFixture(source)).toEqual(['opens the dashboard'])
  })

  test('the same test WITH the fixture is clean', () => {
    const source = `${IMPORT}
      test('opens the dashboard', async ({ page, signedIn }) => {
        await page.goto('/home')
      })`

    expect(testsMissingTheFixture(source)).toEqual([])
  })

  /**
   * THE CASE A LITERAL-`goto` RULE MISSES, AND IT IS THE COMMON ONE.
   *
   * Almost every test worth guarding navigates through a helper —
   * `createWorkspace(page)`, `walkToResult(page)` — and contains no `goto` of
   * its own. MEASURED by mutation: deleting `signedIn` from
   * `prefers-reduced-motion never mounts it at all` left the first draft of this
   * rule green, which is the exact defect it was written for surviving it.
   */
  test('navigation through a local helper counts as navigation', () => {
    const source = `${IMPORT}
      async function createWorkspace(page) {
        await page.goto('/home')
      }
      test('uses the helper', async ({ page }) => {
        await createWorkspace(page)
      })`

    expect(testsMissingTheFixture(source)).toEqual(['uses the helper'])
  })

  test('a helper that is defined but NOT called does not implicate a test', () => {
    const source = `${IMPORT}
      async function createWorkspace(page) {
        await page.goto('/home')
      }
      test('renders its own markup', async ({ page }) => {
        await page.goto('/sign-in')
        await page.setContent('<b>hi</b>')
      })`

    expect(testsMissingTheFixture(source)).toEqual([])
  })

  test('a public route needs no session', () => {
    const source = `${IMPORT}
      test('the detector itself still detects', async ({ page }) => {
        await page.goto('/sign-in')
        await page.setContent('<button>x</button>')
      })`

    expect(testsMissingTheFixture(source)).toEqual([])
  })

  test('one broken test among sound ones is named, and only it', () => {
    const source = `${IMPORT}
      test('signed in', async ({ page, signedIn }) => { await page.goto('/posts') })
      test('forgot the fixture', async ({ page }) => { await page.goto('/wallet') })
      test('public only', async ({ page }) => { await page.goto('/sign-in') })`

    expect(testsMissingTheFixture(source)).toEqual(['forgot the fixture'])
  })

  test('a spec that does not import the fixture is not this rule’s business', () => {
    const source = `import { test } from '@playwright/test'
      test('anonymous', async ({ page }) => { await page.goto('/home') })`

    expect(testsMissingTheFixture(source)).toEqual([])
  })

  test('an ALIASED import is still read', () => {
    const source = `import { test as seeded } from './fixtures/seeded-user'
      seeded('opens the dashboard', async ({ page }) => { await page.goto('/home') })`

    expect(seededTestName(source)).toBe('seeded')
    expect(testsMissingTheFixture(source)).toEqual(['opens the dashboard'])
  })
})

/* ─────────────────────────────────────────────────────── the real suite ── */

const specs = readdirSync(E2E)
  .filter((f) => f.endsWith('.spec.ts'))
  .map((file) => ({ file, name: seededTestName(readFileSync(join(E2E, file), 'utf8')) }))
  .filter((s): s is { file: string; name: string } => s.name !== null)

describe('every spec in this suite obeys it', () => {
  test('there are specs to check — an empty sweep is not a pass', () => {
    // The failure this file guards against, applied to itself: a glob that
    // silently stops matching reports every file as clean.
    expect(specs.length).toBeGreaterThan(0)
  })

  test.each(specs)('$file', ({ file, name }) => {
    const source = readFileSync(join(E2E, file), 'utf8')

    // A file the rule could not READ must never be reported as one it approved.
    // MEASURED: this fired on `onboarding-walk.spec.ts`, whose seeded import is
    // aliased and whose tests were therefore all invisible.
    expect(testCases(source, name).length, `${file}: no ${name}() calls parsed`).toBeGreaterThan(0)

    const missing = testsMissingTheFixture(source)
    expect(
      missing,
      [
        `${file}: these tests import the seeded-user fixture but never ask for it,`,
        'so they run SIGNED OUT and fail against /sign-in with a message about a',
        'missing element:',
        ...missing.map((n) => `  · ${n}`),
      ].join('\n'),
    ).toEqual([])
  })
})
